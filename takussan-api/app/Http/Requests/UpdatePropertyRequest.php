<?php

namespace App\Http\Requests;

use App\Models\Agency;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\PropertyCondition;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RentPeriod;
use App\Models\Enums\TitleType;
use App\Models\Property;
use App\Rules\HoteDeVisiteVirtuelle;
use App\Services\Geo\GeoAddressRules;
use App\Services\Property\CoutDEntree;
use App\Services\Property\HierarchyService;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Validation\Rule;

/**
 * TCK-086 — body schema for `PATCH /api/properties/{property}`.
 *
 * Carries the same fields as the inline validate() that this request
 * replaces, plus the `parent_id` rules required to enforce
 * anti-cycle / max-depth / same-agency invariants.
 */
class UpdatePropertyRequest extends BaseFormRequest
{
    /**
     * TCK-730 (P03.05) — la policy que le contrôleur appelait après la validation est appelée ici,
     * avant elle : un appelant sans droit sur le bien reçoit 403, plus 422 et les noms des champs.
     */
    public function authorize(): bool
    {
        $bien = $this->route('property');

        return $bien instanceof Property
            && $this->user()?->can('update', $bien) === true;
    }

    public function rules(): array
    {
        return [
            'title' => ['sometimes', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
            'type' => ['sometimes', Rule::enum(PropertyType::class)],
            'contract_type' => ['sometimes', Rule::enum(ContractType::class)],
            'rent_period' => ['sometimes', 'nullable', Rule::enum(RentPeriod::class)],
            'title_type' => ['sometimes', 'nullable', Rule::enum(TitleType::class)],
            'condition' => ['sometimes', 'nullable', Rule::enum(PropertyCondition::class)],
            'floor_number' => ['sometimes', 'nullable', 'integer', 'min:-5', 'max:200'],
            'total_floors' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:200'],
            'status' => ['sometimes', Rule::enum(PropertyStatus::class)],
            'visibility' => ['sometimes', Rule::enum(PropertyVisibility::class)],
            // TCK-633 — bornes de COLONNE (`numeric(14,2)`, `integer`) : au-delà, 500 et non 422.
            'price' => ['sometimes', 'numeric', 'min:0', 'max:999999999999.99'],
            'currency' => ['sometimes', Rule::enum(Currency::class)],
            'area' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:2147483647'],
            'bedrooms' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:100'],
            'bathrooms' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:100'],
            'furnished' => ['sometimes', 'boolean'],
            // TCK-633 — une vente sur plan annonce l'année de LIVRAISON : trois ans au plus.
            'year_built' => ['sometimes', 'nullable', 'integer', 'min:1800', 'max:'.((int) date('Y') + 3)],
            'parking_spaces' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:500'],
            // TCK-633 lot F (ADR-0061 §5) — dérivé des boosts, écrit par `BoostLifecycle` seul.
            'featured' => ['prohibited'],
            'available_from' => ['sometimes', 'nullable', 'date'],
            'parent_id' => [
                'sometimes',
                'nullable',
                'integer',
                Rule::exists('properties', 'id')->whereNull('deleted_at'),
                $this->parentIdRule(),
            ],
            'address' => ['sometimes', 'nullable', 'array'],
            'address.street' => ['sometimes', 'nullable', 'string', 'max:255'],
            'address.neighborhood' => ['sometimes', 'nullable', 'string', 'max:120'],
            // TCK-703 (P17.01) — `null` rendait 500 (colonne NOT NULL) : 422, la clé reste facultative.
            'address.city' => ['sometimes', 'filled', 'string', 'max:120'],
            'address.region' => ['sometimes', 'nullable', 'string', 'max:120'],
            // TCK-976 (P54.01) — même forme que la ville : `null` rendait 500, 422 désormais.
            'address.country' => ['sometimes', 'filled', 'string', 'size:2'],
            'address.postal_code' => ['sometimes', 'nullable', 'string', 'max:20'],
            'address.latitude' => ['sometimes', 'nullable', 'numeric', 'between:-90,90'],
            'address.longitude' => ['sometimes', 'nullable', 'numeric', 'between:-180,180'],
            // TCK-633 — la ville et le quartier du référentiel (ADR-0062).
            ...GeoAddressRules::regles($this->user(), $this->input('address.geo_city_id'), partiel: true),
            // TCK-598 — la visite virtuelle : un LIEN https vers un hôte autorisé, jamais un fichier.
            'virtual_tour_url' => ['sometimes', 'nullable', 'string', 'max:2048', 'url:https', new HoteDeVisiteVirtuelle],
            // TCK-598 — le coût d'entrée, d'une location MENSUELLE seulement (422 sinon). Le contrat
            // et la période jugés sont ceux qui RÉSULTERONT de la modification : envoyés, sinon
            // ceux du bien.
            ...CoutDEntree::regles(
                $this->coutDEntreeApplicable(),
                partiel: true,
                fraisAdmis: CoutDEntree::fraisDAgenceAdmis($this->agenceDuBien()),
            ),
        ];
    }

    /**
     * TCK-633 (ADR-0061) — la devise n'est réécrite QUE si le corps l'envoie : un PATCH sans elle
     * ne touche pas à un bien existant.
     */
    protected function prepareForValidation(): void
    {
        if ($this->exists('currency')) {
            $this->merge(['currency' => Currency::XOF->value]);
        }
    }

    private function agenceDuBien(): ?Agency
    {
        /** @var Property|null $bien */
        $bien = $this->route('property');

        return $bien?->agency;
    }

    private function coutDEntreeApplicable(): bool
    {
        /** @var Property|null $bien */
        $bien = $this->route('property');

        return CoutDEntree::sApplique(
            $this->exists('contract_type') ? $this->input('contract_type') : $bien?->contract_type,
            $this->exists('rent_period') ? $this->input('rent_period') : $bien?->rent_period,
        );
    }

    /**
     * Composite rule covering same-agency, anti-cycle and max-depth on the
     * `parent_id` payload key. Runs only when `parent_id` is non-null
     * (detaching to root is always allowed).
     */
    protected function parentIdRule(): ValidationRule
    {
        return new class($this->route('property')) implements ValidationRule
        {
            public function __construct(private readonly ?Property $node) {}

            public function validate(string $attribute, mixed $value, Closure $fail): void
            {
                if ($value === null || $value === '' || $this->node === null) {
                    return;
                }

                $candidate = Property::find($value);
                if ($candidate === null) {
                    return; // exists rule handles this case.
                }

                if ($candidate->agency_id !== $this->node->agency_id) {
                    $fail(__('messages.property_parent_same_agency_required'));

                    return;
                }

                $svc = app(HierarchyService::class);

                if ($svc->wouldCreateCycle($this->node, $candidate)) {
                    $fail(__('messages.property_parent_cycle_detected'));

                    return;
                }

                if ($svc->wouldExceedMaxDepth($this->node, $candidate)) {
                    $fail(__('messages.property_parent_max_depth_exceeded'));
                }
            }
        };
    }
}

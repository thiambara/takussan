<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
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
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de PropertyController::store(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class StorePropertyRequest extends BaseFormRequest
{
    /**
     * TCK-587 — **délégation** à `PropertyPolicy::create` : `properties.create` dans l'agence du
     * profil actif, ou bailleur actif de cette agence (qui PROPOSE un bien, cf.
     * `PropertyController::store`).
     *
     * Ce `authorize()` rendait `true` en affirmant que l'autorisation « appartient au contrôleur » —
     * qui n'en appelait aucune : tout compte authentifié, client compris, créait un bien. La règle
     * reste dans sa policy ; elle est invoquée ICI pour que le refus précède la validation (403 et
     * non 422 pour un appel non autorisé et mal formé).
     */
    public function authorize(): bool
    {
        return $this->user()?->can('create', Property::class) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'type' => ['required', Rule::enum(PropertyType::class)],
            'contract_type' => ['required', Rule::enum(ContractType::class)],
            'rent_period' => ['nullable', Rule::enum(RentPeriod::class)],
            'title_type' => ['nullable', Rule::enum(TitleType::class)],
            // TCK-508 — accepté pour tout type : c'est le modèle qui l'efface sur un terrain
            // (invariant `saving`), pour que la règle tienne aussi quand le TYPE change.
            'condition' => ['nullable', Rule::enum(PropertyCondition::class)],
            'status' => ['nullable', Rule::enum(PropertyStatus::class)],
            'visibility' => ['nullable', Rule::enum(PropertyVisibility::class)],
            // TCK-633 — bornes de COLONNE (`numeric(14,2)`, `integer`) : au-delà, 500 et non 422.
            'price' => ['required', 'numeric', 'min:0', 'max:999999999999.99'],
            'currency' => ['nullable', Rule::enum(Currency::class)],
            'area' => ['nullable', 'integer', 'min:0', 'max:2147483647'],
            'bedrooms' => ['nullable', 'integer', 'min:0', 'max:100'],
            'bathrooms' => ['nullable', 'integer', 'min:0', 'max:100'],
            // TCK-981 (P54.06) — `properties.furnished` est NOT NULL DEFAULT false : omis, il prend le
            // défaut ; `null` rendait 500. `filled` le refuse, comme la ville (TCK-703).
            'furnished' => ['filled', 'boolean'],
            // TCK-633 — les bornes de `UpdatePropertyRequest` ; -5 : un sous-sol est un étage.
            'floor_number' => ['nullable', 'integer', 'min:-5', 'max:200'],
            'total_floors' => ['nullable', 'integer', 'min:1', 'max:200'],
            // TCK-508 — les bornes de `UpdatePropertyRequest` : sans elles, `99999` passait à
            // la création et rendait 422 à la première modification du même bien.
            // TCK-633 — une vente sur plan annonce l'année de LIVRAISON : trois ans au plus.
            'year_built' => ['nullable', 'integer', 'min:1800', 'max:'.((int) date('Y') + 3)],
            'parking_spaces' => ['nullable', 'integer', 'min:0', 'max:500'],
            'available_from' => ['nullable', 'date'],
            'agency_id' => ['nullable', 'exists:agencies,id'],
            'address' => ['nullable', 'array'],
            // TCK-633 — les longueurs du formulaire (`lib/schemas/property.ts`) : sans elles, un
            // texte de 121 caractères devenait une proposition de quartier que la colonne refuse.
            'address.street' => ['nullable', 'string', 'max:255'],
            'address.neighborhood' => ['nullable', 'string', 'max:120'],
            // TCK-703 (P17.01) — `addresses.city` est NOT NULL DEFAULT 'Dakar' : une ville OMISE
            // prend le défaut, une ville `null` ne le prend pas et rendait 500. `filled` refuse le
            // `null` (et `""`, converti en `null`) sans exiger la clé.
            'address.city' => ['filled', 'string', 'max:120'],
            'address.region' => ['nullable', 'string', 'max:120'],
            // TCK-976 (P54.01) — `addresses.country` est NOT NULL DEFAULT 'SN' : même forme que la ville.
            'address.country' => ['filled', 'string', 'size:2'],
            'address.postal_code' => ['nullable', 'string', 'max:20'],
            'address.latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'address.longitude' => ['nullable', 'numeric', 'between:-180,180'],
            // TCK-633 — la ville et le quartier du référentiel (ADR-0062).
            ...GeoAddressRules::regles($this->user(), $this->input('address.geo_city_id'), partiel: false),
            // TCK-598 — la visite virtuelle : un LIEN https vers un hôte autorisé, jamais un fichier.
            'virtual_tour_url' => ['nullable', 'string', 'max:2048', 'url:https', new HoteDeVisiteVirtuelle],
            // TCK-598 — le coût d'entrée, d'une location MENSUELLE seulement (422 sinon).
            ...CoutDEntree::regles(
                CoutDEntree::sApplique($this->input('contract_type'), $this->input('rent_period')),
                partiel: false,
                fraisAdmis: CoutDEntree::fraisDAgenceAdmis($this->agenceVisee()),
            ),
        ];
    }

    /**
     * TCK-633 (ADR-0061) — un bien se publie en francs CFA : la devise envoyée est IGNORÉE, pas
     * refusée (un client ancien qui l'envoie encore ne reçoit pas un 422 qu'il ne comprendrait pas).
     */
    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();
        $this->merge(['currency' => Currency::XOF->value]);
    }

    /** L'agence où le bien sera créé — la règle de `PropertyController::store`. */
    private function agenceVisee(): ?Agency
    {
        $user = $this->user();
        $id = $user?->isSuperAdmin() ? $this->input('agency_id') : $user?->agency_id;

        return is_numeric($id) ? Agency::query()->find((int) $id) : null;
    }
}

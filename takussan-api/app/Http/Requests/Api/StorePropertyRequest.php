<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
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
            'price' => ['required', 'numeric', 'min:0'],
            'currency' => ['nullable', Rule::enum(Currency::class)],
            'area' => ['nullable', 'integer', 'min:0'],
            'bedrooms' => ['nullable', 'integer', 'min:0'],
            'bathrooms' => ['nullable', 'integer', 'min:0'],
            'furnished' => ['nullable', 'boolean'],
            'floor_number' => ['nullable', 'integer'],
            'total_floors' => ['nullable', 'integer'],
            // TCK-508 — les bornes de `UpdatePropertyRequest` : sans elles, `99999` passait à
            // la création et rendait 422 à la première modification du même bien.
            'year_built' => ['nullable', 'integer', 'min:1800', 'max:2100'],
            'parking_spaces' => ['nullable', 'integer'],
            'available_from' => ['nullable', 'date'],
            'agency_id' => ['nullable', 'exists:agencies,id'],
            'address' => ['nullable', 'array'],
            'address.street' => ['nullable', 'string'],
            'address.neighborhood' => ['nullable', 'string'],
            'address.city' => ['nullable', 'string'],
            'address.region' => ['nullable', 'string'],
            'address.country' => ['nullable', 'string', 'size:2'],
            'address.postal_code' => ['nullable', 'string', 'max:20'],
            'address.latitude' => ['nullable', 'numeric'],
            'address.longitude' => ['nullable', 'numeric'],
            // TCK-598 — la visite virtuelle : un LIEN https vers un hôte autorisé, jamais un fichier.
            'virtual_tour_url' => ['nullable', 'string', 'max:2048', 'url:https', new HoteDeVisiteVirtuelle],
            // TCK-598 — le coût d'entrée, d'une location MENSUELLE seulement (422 sinon).
            ...CoutDEntree::regles(
                CoutDEntree::sApplique($this->input('contract_type'), $this->input('rent_period')),
                partiel: false,
            ),
        ];
    }
}

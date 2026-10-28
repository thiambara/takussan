<?php

namespace App\Http\Requests\Api\Admin;

use App\Ai\Agents\RadarExtraction;
use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\PropertyType;
use App\Models\Enums\RadarAdvertiserNature;
use App\Models\Enums\RentPeriod;
use App\Services\Radar\RadarReviewFields;
use Illuminate\Validation\Rule;

/**
 * TCK-2387 (ADR-0077 §5) — la correction d'une fiche lue : chaque champ de {@see RadarReviewFields::EDITABLE}
 * est facultatif, et `null` l'efface. Seule la nature de l'annonceur ne s'efface pas (une fiche n'est jamais
 * « sans nature » : `unknown` dit l'ignorance). Un corps sans aucun champ connu est refusé.
 *
 * Les bornes ne servent qu'à refuser l'absurde (un prix à quinze chiffres, un quartier fusionné) : la
 * vraisemblance, elle, n'est pas jugée ici, l'humain tranche (ADR-0077 §5). Le quartier doit être approuvé
 * et non fusionné — une proposition en attente ou refusée ne rattache rien.
 */
class UpdateRadarListingRequest extends BaseFormRequest
{
    public const MAX_PRICE = 100_000_000_000;

    /** Gardée par `super-admin` + `platform-can:platform.radar.operate` sur la route, comme la saisie. */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'property_type' => ['sometimes', 'nullable', Rule::enum(PropertyType::class)],
            'contract' => ['sometimes', 'nullable', Rule::in(RadarExtraction::CONTRACTS)],
            'rent_period' => ['sometimes', 'nullable', Rule::enum(RentPeriod::class)],
            'price' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:'.self::MAX_PRICE],
            'neighborhood_id' => ['sometimes', 'nullable', 'integer', Rule::exists('geo_neighborhoods', 'id')
                ->where(fn ($query) => $query->where('status', 'approved')->whereNull('merged_into_id'))],
            'city' => ['sometimes', 'nullable', 'string', 'max:120'],
            'bedrooms' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:99'],
            'bathrooms' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:99'],
            'surface_m2' => ['sometimes', 'nullable', 'numeric', 'min:1', 'max:10000000'],
            'furnished' => ['sometimes', 'nullable', 'boolean'],
            'amenities' => ['sometimes', 'nullable', 'array', 'max:40'],
            'amenities.*' => ['string', 'max:80'],
            'title' => ['sometimes', 'nullable', 'string', 'max:200'],
            'description' => ['sometimes', 'nullable', 'string', 'max:20000'],
            'advertiser_nature' => ['sometimes', 'required', Rule::enum(RadarAdvertiserNature::class)],
        ];
    }

    protected function passedValidation(): void
    {
        abort_code_if($this->validated() === [], 422, 'radar.listing.nothing_to_update');
    }

    /**
     * Les corrections, aux types que porte `extracted` : un prix en chaîne (`"400000"`) ne doit pas
     * passer pour une modification de l'entier lu, ni `"1"` pour un booléen.
     *
     * @return array<string, mixed>
     */
    public function changes(): array
    {
        $changes = [];
        foreach ($this->validated() as $field => $value) {
            $changes[$field] = match (true) {
                $value === null => null,
                in_array($field, ['price', 'bedrooms', 'bathrooms', 'neighborhood_id'], true) => (int) $value,
                $field === 'surface_m2' => $value + 0,
                $field === 'furnished' => filter_var($value, FILTER_VALIDATE_BOOLEAN),
                $field === 'amenities' => array_values($value),
                default => $value,
            };
        }

        return $changes;
    }
}

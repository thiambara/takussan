<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\RadarListingStage;
use App\Models\RadarListing;
use App\Services\Radar\RadarMatcher;
use Illuminate\Validation\Rule;

/**
 * TCK-2387 (ADR-0054) — « doublon de » : EXACTEMENT une cible, une autre annonce collectée (`of_listing_id`,
 * ni elle-même, ni purgée) ou un bien du catalogue (`of_property_id`, non supprimé, et réel : un bien de
 * test n'est pas une cible, comme pour {@see RadarMatcher}).
 *
 * Une annonce déjà `duplicate` n'est pas une cible (la chaîne n'aboutirait nulle part : TCK-2389 suit le lien
 * jusqu'à une fiche vivante), ni une annonce qui pointe déjà vers celle-ci (un cycle A↔B) : `radar.duplicate.chain`.
 * Le contrôle lit la cible au moment de valider ; deux gestes croisés strictement simultanés ne sont pas
 * sérialisés ici (le lien reste une trace d'opérateur, TCK-2389 borne la chaîne qu'il suit).
 */
class MarkRadarListingDuplicateRequest extends BaseFormRequest
{
    /** Gardée par `super-admin` + `platform-can:platform.radar.operate` sur la route, comme la saisie. */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'of_listing_id' => ['required_without:of_property_id', 'prohibits:of_property_id', 'integer', 'min:1',
                Rule::exists('radar_listings', 'id')->where(fn ($query) => $query->where('stage', '!=', RadarListingStage::Purged->value))],
            'of_property_id' => ['required_without:of_listing_id', 'prohibits:of_listing_id', 'integer', 'min:1',
                Rule::exists('properties', 'id')->whereNull('deleted_at')
                // Un booléen passé à `where()` de la règle se formate en `0`/`1` : PostgreSQL le refuse. La fermeture écrit un vrai `false`.
                    ->where(fn ($query) => $query->where('is_test', false))],
        ];
    }

    protected function passedValidation(): void
    {
        $self = $this->route('listing');
        $targetId = $this->ofListingId();
        abort_code_if($self instanceof RadarListing && $targetId === $self->id, 422, 'radar.duplicate.self');

        if ($self instanceof RadarListing && $targetId !== null) {
            $target = RadarListing::query()->select(['id', 'stage', 'duplicate_of_listing_id'])->find($targetId);
            abort_code_if(
                $target !== null && ($target->stage === RadarListingStage::Duplicate || $target->duplicate_of_listing_id === $self->id),
                422,
                'radar.duplicate.chain',
            );
        }
    }

    public function ofListingId(): ?int
    {
        $id = $this->validated('of_listing_id');

        return $id === null ? null : (int) $id;
    }

    public function ofPropertyId(): ?int
    {
        $id = $this->validated('of_property_id');

        return $id === null ? null : (int) $id;
    }
}

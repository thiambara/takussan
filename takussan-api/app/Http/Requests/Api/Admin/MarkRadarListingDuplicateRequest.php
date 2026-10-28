<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\RadarListingStage;
use App\Models\RadarListing;
use Illuminate\Validation\Rule;

/**
 * TCK-2387 (ADR-0054) — « doublon de » : EXACTEMENT une cible, une autre annonce collectée (`of_listing_id`,
 * ni elle-même, ni purgée) ou un bien du catalogue (`of_property_id`, non supprimé).
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
                Rule::exists('properties', 'id')->whereNull('deleted_at')],
        ];
    }

    protected function passedValidation(): void
    {
        $self = $this->route('listing');
        abort_code_if(
            $self instanceof RadarListing && $this->validated('of_listing_id') !== null && (int) $this->validated('of_listing_id') === $self->id,
            422,
            'radar.duplicate.self',
        );
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

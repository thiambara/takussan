<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-2389 — publier pour un annonceur : les annonces à publier, de 1 à 50. Les doublons sont écartés ensuite (un double clic
 * n'écrit pas deux biens) ; l'accord, l'étape et la réserve de photos se jugent sous verrou, dans `RadarPublisher`.
 */
class PublishRadarListingsRequest extends BaseFormRequest
{
    /** Gardée par `super-admin` + `platform-can:platform.radar.publish` sur la route. */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'listing_ids' => ['required', 'array', 'min:1', 'max:50'],
            'listing_ids.*' => ['required', 'integer', 'min:1'],
        ];
    }

    /** @return list<int> */
    public function listingIds(): array
    {
        return array_values(array_map('intval', (array) $this->validated('listing_ids')));
    }
}

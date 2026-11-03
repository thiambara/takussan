<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Services\Radar\ConsentMessageComposer;
use Illuminate\Validation\Rule;

/**
 * TCK-2388 (ADR-0077 §4) — préparer un message d'accord : soit pour des annonces (`listing_ids`, de 1 à 20, d'un seul
 * annonceur), soit comme relance d'un message envoyé (`follow_up_of_id`, dont les annonces sont reprises : les deux ne
 * se donnent pas ensemble). La langue est celle de {@see ConsentMessageComposer::LOCALES} ; absente, le français.
 * Les règles qui regardent l'état (étape, accord, chaîne, prise en charge) se jugent dans
 * `RadarOutreachWorkflow`, sous verrou.
 */
class StoreRadarOutreachRequest extends BaseFormRequest
{
    public const MAX_LISTINGS = 20;

    /** Gardée par `super-admin` + `platform-can:platform.radar.operate` sur la route. */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'listing_ids' => ['required_without:follow_up_of_id', 'prohibits:follow_up_of_id', 'array', 'min:1', 'max:'.self::MAX_LISTINGS],
            'listing_ids.*' => ['integer', 'distinct', Rule::exists('radar_listings', 'id')],
            'follow_up_of_id' => ['integer', Rule::exists('radar_outreaches', 'id')],
            'locale' => ['nullable', Rule::in(ConsentMessageComposer::LOCALES)],
        ];
    }

    /** @return list<int>|null */
    public function listingIds(): ?array
    {
        $ids = $this->validated('listing_ids');

        return $ids === null ? null : array_map('intval', $ids);
    }

    public function followUpOfId(): ?int
    {
        $id = $this->validated('follow_up_of_id');

        return $id === null ? null : (int) $id;
    }

    public function locale(): string
    {
        return $this->validated('locale') ?? ConsentMessageComposer::DEFAULT_LOCALE;
    }
}

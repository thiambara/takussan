<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Agency;
use App\Models\Enums\ReviewStatus;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Validation\Rule;

/**
 * TCK-597 (AC7) — `GET /api/reviews/received` : les filtres se jugent côté serveur, en une requête.
 */
class IndexReceivedReviewsRequest extends BaseFormRequest
{
    public const MAX_PER_PAGE = 50;

    /** Les genres de sujet, et la classe qu'ils désignent. */
    public const SUBJECT_TYPES = [
        'property' => Property::class,
        'agent' => User::class,
        'agency' => Agency::class,
        'service_provider' => ServiceProviderProfile::class,
    ];

    /**
     * Le périmètre EST l'autorisation : `ReceivedReviews` ne rend que les avis de l'acteur. Rien à
     * refuser ici — `BaseFormRequest` refuse par défaut.
     */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'filter' => ['sometimes', 'array'],
            'filter.property_id' => ['sometimes', 'integer', 'min:1'],
            'filter.replied' => ['sometimes', Rule::in(['0', '1', 0, 1, true, false, 'true', 'false'])],
            // Un avis rejeté n'est jamais dans la boîte : le filtre ne l'offre pas.
            'filter.status' => ['sometimes', Rule::in([ReviewStatus::Pending->value, ReviewStatus::Approved->value, ReviewStatus::Reported->value])],
            'filter.subject_type' => ['sometimes', Rule::in(array_keys(self::SUBJECT_TYPES))],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:'.self::MAX_PER_PAGE],
            'page' => ['sometimes', 'integer', 'min:1'],
        ];
    }
}

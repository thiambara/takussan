<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Review;
use App\Services\Review\ReviewModerationService;
use Illuminate\Validation\Rule;

/**
 * TCK-2672 — `POST /api/reviews/moderate-batch` : publier d'un geste au plus 100 avis. Seule la
 * décision `approve` existe en lot ; masquer, retirer, ignorer restent des gestes unitaires, avec
 * leur motif. L'autorisation est celle de la file (`viewModerationQueue`) ; que CHAQUE avis soit
 * modérable par l'appelant se juge sous verrou, dans {@see ReviewModerationService::approveBatch()}.
 */
class ModerateReviewBatchRequest extends BaseFormRequest
{
    public const MAX_REVIEWS = 100;

    public function authorize(): bool
    {
        return $this->user()?->can('viewModerationQueue', Review::class) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'review_ids' => ['required', 'array', 'min:1', 'max:'.self::MAX_REVIEWS],
            'review_ids.*' => ['required', 'integer', 'min:1', 'max:9223372036854775807', 'distinct'],
            'decision' => ['required', 'string', Rule::in(['approve'])],
        ];
    }
}

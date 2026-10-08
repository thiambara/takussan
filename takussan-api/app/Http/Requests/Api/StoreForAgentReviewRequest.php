<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Services\Review\ReviewEligibility;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-597 (ADR-0043 §3, AC8) — noter un agent. L'éligibilité court dans `authorize()`, donc AVANT
 * la validation (403 avant 422, TCK-305), et la preuve trouvée est gardée pour le contrôleur, qui
 * l'écrit dans `context_*` et en tire l'agence modératrice.
 */
class StoreForAgentReviewRequest extends BaseFormRequest
{
    private ?Model $proof = null;

    public function authorize(): bool
    {
        $author = $this->user();
        $agent = $this->route('user');

        if ($author === null || $agent === null) {
            return false;
        }

        $this->proof = app(ReviewEligibility::class)->forAgent($author, $agent);

        return $this->proof !== null;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'title' => ['nullable', 'string', 'max:255'],
            'content' => ['nullable', 'string', 'max:5000'],
        ];
    }

    /** La visite, le bail ou la réservation qui rend l'avis possible. */
    public function proof(): Model
    {
        return $this->proof;
    }
}

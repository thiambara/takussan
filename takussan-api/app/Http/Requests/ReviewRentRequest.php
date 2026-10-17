<?php

namespace App\Http\Requests;

use App\Services\Lease\RentReviewService;

/**
 * TCK-091 — `PATCH /api/leases/{lease}/rent` payload validator.
 *
 * Variation-pct, status, and back-dating are enforced inside
 * `RentReviewService::review` so direct service callers (admin commands,
 * tests) get the same protection as the HTTP layer.
 */
class ReviewRentRequest extends BaseFormRequest
{
    /**
     * TCK-816 (P22.01) — l'ability que le contrôleur juge, appelée ici pour que le refus précède la
     * validation : `true` sec rendait 422 et les noms des champs à un compte sans lien.
     */
    public function authorize(): bool
    {
        return $this->user()?->can('reviewRent', $this->route('lease')) === true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'new_rent' => ['required', 'numeric', 'min:0.01'],
            'reason' => [
                'required',
                'string',
                'min:'.RentReviewService::REASON_MIN,
                'max:'.RentReviewService::REASON_MAX,
            ],
            // Optional — defaults to today inside the service. Future dates
            // are valid (handled as a cut-off in the activity log); past
            // dates are rejected at the service layer.
            'effective_date' => ['nullable', 'date'],
            'force' => ['nullable', 'boolean'],
        ];
    }
}

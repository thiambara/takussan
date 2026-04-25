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
    public function authorize(): bool
    {
        return true;
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

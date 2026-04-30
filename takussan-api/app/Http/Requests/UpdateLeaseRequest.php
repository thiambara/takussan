<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\Validator;
use Illuminate\Validation\ValidationException;

/**
 * TCK-087 — `PATCH /api/leases/{lease}` payload validator.
 *
 * Currently only the late-fee config is editable through this endpoint;
 * lifecycle changes (status, dates, monthly_rent…) flow through their
 * dedicated actions on `LeaseController` (activate, terminate, renew) or
 * dedicated endpoints (`PATCH /leases/{lease}/rent` for rent reviews —
 * TCK-091).
 */
class UpdateLeaseRequest extends BaseFormRequest
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
            'late_fee_percent' => ['sometimes', 'nullable', 'numeric', 'between:0,50'],
            'late_fee_grace_days' => ['sometimes', 'nullable', 'integer', 'between:0,30'],
        ];
    }

    /**
     * TCK-091 — Reject `monthly_rent` (and `sale_price`) in the generic
     * PATCH payload so every rent change flows through the dedicated
     * rent-review endpoint (which enforces variation guards, journals
     * the change in the activity log, and notifies the tenant). The
     * error is reported on the actual offending key(s) so the frontend
     * can highlight the right field.
     */
    protected function passedValidation(): void
    {
        $offending = [];
        foreach (['monthly_rent', 'sale_price'] as $key) {
            if ($this->has($key)) {
                $offending[$key] = [__('messages.lease_rent_use_dedicated_endpoint')];
            }
        }

        if ($offending !== []) {
            throw ValidationException::withMessages($offending)->status(422);
        }
    }

    /**
     * @return array<string,string>
     */
    public function messages(): array
    {
        return [];
    }

    public function withValidator(Validator $validator): void
    {
        // No additional cross-field rules for now — keeping the hook so
        // future custom rules don't change the public signature.
    }
}

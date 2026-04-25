<?php

namespace App\Http\Requests;

/**
 * TCK-087 — `PATCH /api/leases/{lease}` payload validator.
 *
 * Currently only the late-fee config is editable through this endpoint;
 * lifecycle changes (status, dates, monthly_rent…) flow through their
 * dedicated actions on `LeaseController` (activate, terminate, renew).
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
}

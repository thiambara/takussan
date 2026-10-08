<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/** TCK-594 (ADR-0039 §8) — le rejet porte son motif. */
class RejectServiceProviderBillRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('manage', $this->route('serviceProviderBill')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'rejection_reason' => ['required', 'string', 'max:2000'],
        ];
    }
}

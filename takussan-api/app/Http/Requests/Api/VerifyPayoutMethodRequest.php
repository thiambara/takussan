<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-594 (ADR-0039 §6) — `POST /api/payout-methods/{payoutMethod}/verify`. Délégation à
 * `PayoutMethodPolicy::verify`.
 */
class VerifyPayoutMethodRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('verify', $this->route('payoutMethod')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}

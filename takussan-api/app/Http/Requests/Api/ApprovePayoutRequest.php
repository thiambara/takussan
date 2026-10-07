<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-594 (ADR-0039 §4) — `POST /api/payouts/{payout}/approve`. Simple DÉLÉGATION à
 * `PayoutPolicy::approve()`.
 *
 * Point de raccord TCK-589 : le step-up 2FA s'ajoute sur la route (`->middleware(...)`), pas ici.
 */
class ApprovePayoutRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('approve', $this->route('payout')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}

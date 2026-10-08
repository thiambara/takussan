<?php

namespace App\Http\Requests\Api\Me;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-594 (ADR-0039 §6) — `PATCH /api/me/payout-methods/{payoutMethod}`. Délégation à
 * `PayoutMethodPolicy::update` : le titulaire, et lui seul.
 */
class UpdatePayoutMethodRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('payoutMethod')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $kind = $this->input('kind') ?? $this->route('payoutMethod')?->kind?->value;

        // Changer de nature exige de ressaisir le numéro : un numéro Wave n'est pas un RIB.
        return array_merge(StorePayoutMethodRequest::shape($kind, required: false), [
            'account_identifier' => array_merge(
                ['required_with:kind'],
                StorePayoutMethodRequest::shape($kind, required: false)['account_identifier'],
            ),
        ]);
    }
}

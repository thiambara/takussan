<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-594 (ADR-0039 §4, VERIF-594 M-2) — `POST /api/agencies/{agency}/payout-threshold/confirm`.
 * Simple DÉLÉGATION à `AgencyPolicy::updatePayoutThreshold()`.
 *
 * VERIF-594 passe 2, N-5 — la confirmation porte la valeur que le confirmateur a lue (`null` : couper
 * le seuil). Présente, même nulle : une confirmation sans elle ne dit pas ce qu'elle confirme.
 *
 * Point de raccord TCK-589 : le step-up 2FA s'ajoute sur la route (`->middleware(...)`), pas ici.
 */
class ConfirmPayoutThresholdRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('updatePayoutThreshold', $this->route('agency')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'expected_threshold' => ['present', 'nullable', 'numeric', 'min:0'],
        ];
    }
}

<?php

namespace App\Http\Requests\Accounting;

use App\Http\Requests\BaseFormRequest;
use Illuminate\Validation\Rule;

class MatchBankStatementLineRequest extends BaseFormRequest
{
    /** TCK-818 (P22.04) — la policy que le contrôleur juge, invoquée avant la validation. */
    public function authorize(): bool
    {
        return $this->user()?->can('match', $this->route('line')) === true;
    }

    public function rules(): array
    {
        return [
            'payment_type' => ['required', Rule::in(['booking_payment', 'lease_payment', 'lease_payment_late_fee', 'invoice', 'payout', 'platform_payout'])],
            'payment_id' => ['required', 'integer'],
        ];
    }
}

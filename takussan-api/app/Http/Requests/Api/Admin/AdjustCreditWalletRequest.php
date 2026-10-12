<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;

/** TCK-633 lot F (ADR-0061 §2) — créditer (> 0) ou débiter (< 0) un espace, toujours motivé. */
class AdjustCreditWalletRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isSuperAdmin() === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'amount' => ['required', 'integer', 'between:-100000,100000', 'not_in:0'],
            'reason' => ['required', 'string', 'min:5', 'max:500'],
        ];
    }
}

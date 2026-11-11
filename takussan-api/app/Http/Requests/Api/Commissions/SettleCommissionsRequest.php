<?php

namespace App\Http\Requests\Api\Commissions;

use App\Http\Requests\BaseFormRequest;
use App\Models\CommissionEntry;
use App\Services\Commission\CommissionLedgerService;

/**
 * TCK-2661 — `POST /api/commissions/settle` : solder en une fois des lignes dues d'un bénéficiaire.
 * L'autorisation (`CommissionEntryPolicy::settle`, `payouts.approve` à l'agence active, jamais pour
 * soi-même) précède la validation. Que les lignes soient bien les siennes, de cette agence et dues
 * se juge sous verrou, dans `CommissionLedgerService::settle`.
 */
class SettleCommissionsRequest extends BaseFormRequest
{
    use CommissionPaymentRules;

    public function authorize(): bool
    {
        $beneficiary = $this->input('beneficiary_id');

        return $this->user()?->can('settle', [CommissionEntry::class, is_numeric($beneficiary) ? (int) $beneficiary : 0]) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'beneficiary_id' => ['required', 'integer', 'min:1'],
            'entry_ids' => ['required', 'array', 'min:1', 'max:'.CommissionLedgerService::SETTLE_MAX],
            'entry_ids.*' => ['required', 'integer', 'min:1', 'distinct'],
            ...$this->paymentRules(),
        ];
    }
}

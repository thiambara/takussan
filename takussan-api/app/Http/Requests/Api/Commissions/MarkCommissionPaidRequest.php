<?php

namespace App\Http\Requests\Api\Commissions;

use App\Http\Requests\BaseFormRequest;
use App\Models\CommissionEntry;

/**
 * TCK-2661 — `POST /api/commissions/{id}/mark-paid` : la date, le moyen et la référence du paiement.
 * L'autorisation (`CommissionEntryPolicy::markPaid`) précède la validation : qui ne peut pas payer
 * reçoit 403, jamais la liste des moyens.
 */
class MarkCommissionPaidRequest extends BaseFormRequest
{
    use CommissionPaymentRules;

    public function authorize(): bool
    {
        return $this->user()?->can('markPaid', $this->route('commissionEntry')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        // TCK-2662 — la transition de TCK-2661 (un corps vide gardait le geste d'avant) est retirée :
        // un corps vide est refusé comme tout autre corps sans moyen de paiement.
        $entry = $this->route('commissionEntry');

        return $this->paymentRules($entry instanceof CommissionEntry
            ? $entry->earned_at?->copy()->setTimezone(CommissionEntry::DATE_TIMEZONE)->toDateString()
            : null);
    }
}

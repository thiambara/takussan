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
    use TransitionalEmptyBody;

    public function authorize(): bool
    {
        return $this->user()?->can('markPaid', $this->route('commissionEntry')) === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        // TCK-2661 — transition, retiré par TCK-2662 : un corps vide n'est pas validé.
        if ($this->isTransitionalEmptyBody()) {
            return [];
        }

        $entry = $this->route('commissionEntry');

        return $this->paymentRules($entry instanceof CommissionEntry
            ? $entry->earned_at?->copy()->setTimezone(CommissionEntry::DATE_TIMEZONE)->toDateString()
            : null);
    }
}

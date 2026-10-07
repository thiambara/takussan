<?php

namespace App\Notifications\Payouts;

use App\Models\Payout;

/** TCK-594 (ADR-0039 §4) — aux détenteurs de `payouts.approve`, sauf l'émetteur et le bénéficiaire. */
class PayoutAwaitingApprovalNotification extends MoneyOutNotification
{
    public function __construct(public Payout $payout) {}

    protected function code(): string
    {
        return 'payout_awaiting_approval';
    }

    protected function data(): array
    {
        return [
            'payout_id' => $this->payout->id,
            'reference' => $this->payout->reference_number,
            'net_amount' => $this->amount($this->payout->net_amount, $this->payout->currency?->value),
            'currency' => $this->payout->currency?->value,
            'issued_by_id' => $this->payout->issued_by_id,
        ];
    }
}

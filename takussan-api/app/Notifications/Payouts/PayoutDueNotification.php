<?php

namespace App\Notifications\Payouts;

use App\Models\Payout;

/** TCK-594 (AC20) — à l'émetteur : un reversement programmé est échu, et le décaissement est manuel. */
class PayoutDueNotification extends MoneyOutNotification
{
    public function __construct(public Payout $payout) {}

    protected function code(): string
    {
        return 'payout_due';
    }

    protected function data(): array
    {
        return [
            'payout_id' => $this->payout->id,
            'reference' => $this->payout->reference_number,
            'net_amount' => $this->amount($this->payout->net_amount, $this->payout->currency?->value),
            'currency' => $this->payout->currency?->value,
            'scheduled_at' => $this->payout->scheduled_at?->toIso8601String(),
        ];
    }
}

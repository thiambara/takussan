<?php

namespace App\Notifications\Payouts;

use App\Models\Payout;

/** TCK-594 (AC17) — au bénéficiaire : le net, la référence, la destination masquée. */
class PayoutProcessedNotification extends MoneyOutNotification
{
    public function __construct(public Payout $payout) {}

    protected function code(): string
    {
        return 'payout_processed';
    }

    protected function lines(): array
    {
        return ['intro', 'reference_line', 'destination_line'];
    }

    protected function data(): array
    {
        return [
            'payout_id' => $this->payout->id,
            'reference' => $this->payout->reference_number,
            'net_amount' => $this->amount($this->payout->net_amount, $this->payout->currency?->value),
            'currency' => $this->payout->currency?->value,
            'transaction_id' => $this->payout->transaction_id,
            'destination' => $this->payout->metadata['destination_masked'] ?? null,
        ];
    }
}

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
        // Une ligne sans valeur ne s'écrit pas : un paiement en espèces n'a ni référence obligatoire
        // ni destination.
        return array_values(array_filter([
            'intro',
            $this->payout->transaction_id ? 'reference_line' : null,
            ($this->payout->metadata['destination_masked'] ?? null) ? 'destination_line' : null,
        ]));
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

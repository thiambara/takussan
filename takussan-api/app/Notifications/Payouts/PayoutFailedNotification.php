<?php

namespace App\Notifications\Payouts;

use App\Models\Payout;

/** TCK-594 (AC17) — au bénéficiaire : le reversement a échoué, et pourquoi. */
class PayoutFailedNotification extends MoneyOutNotification
{
    public function __construct(public Payout $payout) {}

    protected function code(): string
    {
        return 'payout_failed';
    }

    protected function lines(): array
    {
        return ['intro', 'reason_line'];
    }

    protected function data(): array
    {
        return [
            'payout_id' => $this->payout->id,
            'reference' => $this->payout->reference_number,
            'net_amount' => $this->amount($this->payout->net_amount, $this->payout->currency?->value),
            'currency' => $this->payout->currency?->value,
            'reason' => $this->payout->failed_reason,
        ];
    }
}

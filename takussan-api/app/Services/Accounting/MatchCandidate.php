<?php

namespace App\Services\Accounting;

readonly class MatchCandidate
{
    public function __construct(
        public int $id,
        public string $type, // short key: booking_payment, lease_payment, invoice
        public string $label,
        public string $amount,
        public string $currency,
        public ?string $reference,
        public ?string $paidAt,
        public ?string $payerName,
    ) {}
}

<?php

namespace App\Services\Accounting;

readonly class MatchSuggestion
{
    public function __construct(
        public string $paymentType,
        public int $paymentId,
        public int $confidence,
        // TCK-2793 — la part de l'échéance désignée (`LeasePayment::PART_LATE_FEE`), nulle sinon.
        public ?string $part = null,
    ) {}
}

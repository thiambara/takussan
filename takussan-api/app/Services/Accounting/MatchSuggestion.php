<?php

namespace App\Services\Accounting;

readonly class MatchSuggestion
{
    public function __construct(
        public string $paymentType,
        public int $paymentId,
        public int $confidence,
    ) {}
}

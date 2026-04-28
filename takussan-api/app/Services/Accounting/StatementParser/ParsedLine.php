<?php

namespace App\Services\Accounting\StatementParser;

use App\Models\Enums\BankStatementLineDirection;
use Carbon\CarbonImmutable;

readonly class ParsedLine
{
    public function __construct(
        public CarbonImmutable $postedAt,
        public float $amount,
        public BankStatementLineDirection $direction,
        public string $currency,
        public string $label,
        public ?string $reference,
        public ?string $counterparty,
        public array $raw,
    ) {}
}

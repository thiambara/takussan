<?php

namespace App\Services\Accounting\StatementParser;

use App\Models\Enums\BankStatementLineDirection;
use Carbon\CarbonImmutable;

readonly class ParsedLine
{
    /**
     * TCK-1704 (P124.01) — la longueur de `bank_statement_lines.reference` et `.counterparty`
     * (`varchar(255)`). Une cellule plus longue faisait lever l'insertion du paquet, et le relevé
     * ENTIER passait `failed` : les pilotes la tronquent, en caractères.
     */
    public const TEXT_MAX = 255;

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

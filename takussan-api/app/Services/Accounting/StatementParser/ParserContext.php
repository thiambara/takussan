<?php

namespace App\Services\Accounting\StatementParser;

use App\Models\Agency;
use App\Models\Enums\BankStatementSourceFormat;

readonly class ParserContext
{
    public function __construct(
        public Agency $agency,
        public BankStatementSourceFormat $format,
        public ?array $csvMapping = null,
        // TCK-593 — les lignes sautées, comptées par le pilote et lues par le job.
        public ParseTally $tally = new ParseTally,
    ) {}
}

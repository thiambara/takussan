<?php

namespace App\Services\Accounting\StatementParser;

use App\Models\Enums\BankStatementSourceFormat;

class StatementParserFactory
{
    public function for(BankStatementSourceFormat $format): StatementParserInterface
    {
        return match ($format) {
            BankStatementSourceFormat::Csv => app(CsvDriver::class),
            BankStatementSourceFormat::Ofx => app(OfxDriver::class),
        };
    }
}

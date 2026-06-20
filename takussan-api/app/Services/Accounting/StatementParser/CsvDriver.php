<?php

namespace App\Services\Accounting\StatementParser;

use App\Models\Enums\BankStatementLineDirection;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Log;
use League\Csv\Reader;

class CsvDriver implements StatementParserInterface
{
    private const DEFAULT_MAPPING = [
        'delimiter' => ',',
        'has_header' => true,
        'date_column' => 'date',
        'date_format' => 'd/m/Y',
        'amount_column' => 'amount',
        'label_column' => 'label',
        'reference_column' => 'reference',
        'counterparty_column' => 'counterparty',
        'currency_column' => null,
        'sign_convention' => 'amount_signed', // or 'direction_column'
        'direction_column' => null,
    ];

    /** @return iterable<ParsedLine> */
    public function parse(string $absolutePath, ParserContext $context): iterable
    {
        $mapping = array_merge(self::DEFAULT_MAPPING, $context->csvMapping ?? []);

        $reader = Reader::createFromPath($absolutePath, 'r');
        $reader->setDelimiter($mapping['delimiter']);

        if ($mapping['has_header'] !== false) {
            $reader->setHeaderOffset(0);
        }

        $defaultCurrency = $context->agency->currency?->value ?? 'XOF';
        $lineNumber = 0;

        foreach ($reader->getRecords() as $record) {
            $lineNumber++;

            try {
                $parsedLine = $this->parseSingleRecord($record, $mapping, $defaultCurrency);

                if ($parsedLine !== null) {
                    yield $parsedLine;
                }
            } catch (\Throwable $e) {
                Log::warning("CsvDriver: skipping line {$lineNumber}", [
                    'error' => $e->getMessage(),
                    'record' => array_slice($record, 0, 5),
                ]);
            }
        }
    }

    private function parseSingleRecord(array $record, array $mapping, string $defaultCurrency): ?ParsedLine
    {
        $rawDate = trim($record[$mapping['date_column']] ?? '');
        $rawAmount = trim($record[$mapping['amount_column']] ?? '');

        if ($rawDate === '' || $rawAmount === '') {
            return null;
        }

        $postedAt = CarbonImmutable::createFromFormat($mapping['date_format'], $rawDate);

        if (! $postedAt) {
            throw new \RuntimeException("Invalid date: {$rawDate}");
        }

        $amount = $this->parseAmount($rawAmount);

        if ($mapping['sign_convention'] === 'amount_signed') {
            $direction = $amount >= 0
                ? BankStatementLineDirection::Credit
                : BankStatementLineDirection::Debit;
            $amount = abs($amount);
        } else {
            $dirValue = strtolower(trim($record[$mapping['direction_column'] ?? 'direction'] ?? 'credit'));
            $direction = $dirValue === 'debit'
                ? BankStatementLineDirection::Debit
                : BankStatementLineDirection::Credit;
        }

        $currency = $defaultCurrency;
        if (! empty($mapping['currency_column']) && isset($record[$mapping['currency_column']])) {
            $currency = strtoupper(trim($record[$mapping['currency_column']]));
        }

        return new ParsedLine(
            postedAt: $postedAt,
            amount: $amount,
            direction: $direction,
            currency: $currency,
            label: trim($record[$mapping['label_column']] ?? ''),
            reference: $this->nullIfEmpty($record[$mapping['reference_column']] ?? null),
            counterparty: $this->nullIfEmpty($record[$mapping['counterparty_column']] ?? null),
            raw: $record,
        );
    }

    private function nullIfEmpty(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }

    /**
     * Parse a monetary string into a float, correctly handling both decimal
     * conventions. The previous `str_replace([' ', ','], ['', '.'])` turned
     * EVERY comma into a decimal point, so "1,234.56" became "1.234.56" →
     * (float) 1.234 — a silent 1000× data-loss bug.
     */
    private function parseAmount(string $raw): float
    {
        $s = str_replace(' ', '', trim($raw));
        $hasComma = str_contains($s, ',');
        $hasDot = str_contains($s, '.');

        if ($hasComma && $hasDot) {
            // The right-most separator is the decimal one; the other groups thousands.
            if (strrpos($s, ',') > strrpos($s, '.')) {
                $s = str_replace(['.', ','], ['', '.'], $s);
            } else {
                $s = str_replace(',', '', $s);
            }
        } elseif ($hasComma) {
            // Only a comma present → it is the decimal separator.
            $s = str_replace(',', '.', $s);
        }

        return (float) $s;
    }
}

<?php

namespace App\Services\Accounting\StatementParser;

use App\Models\Enums\BankStatementLineDirection;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Log;

/**
 * Lightweight OFX 1.x (SGML) parser — no external dependency.
 *
 * Extracts <STMTTRN> blocks from the content and maps each transaction
 * to a ParsedLine DTO. OFX 2.x (XML) files also work since regex is
 * tolerant of self-closing tags and whitespace.
 */
class OfxDriver implements StatementParserInterface
{
    /** @return iterable<ParsedLine> */
    public function parse(string $absolutePath, ParserContext $context): iterable
    {
        $content = file_get_contents($absolutePath);

        if ($content === false) {
            throw new \RuntimeException("Cannot read file: {$absolutePath}");
        }

        // Extract default currency from <CURDEF>
        $defaultCurrency = $context->agency->currency?->value ?? 'XOF';
        if (preg_match('#<CURDEF>([A-Z]{3})#i', $content, $m)) {
            $defaultCurrency = strtoupper($m[1]);
        }

        // Extract all STMTTRN blocks
        preg_match_all('#<STMTTRN>(.*?)</STMTTRN>#si', $content, $blocks);

        $lineNumber = 0;

        foreach ($blocks[1] as $block) {
            $lineNumber++;

            try {
                $parsed = $this->parseBlock($block, $defaultCurrency);

                if ($parsed !== null) {
                    yield $parsed;
                }
            } catch (\Throwable $e) {
                Log::warning("OfxDriver: skipping transaction #{$lineNumber}", [
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }

    private function parseBlock(string $block, string $defaultCurrency): ?ParsedLine
    {
        $trnType = $this->extractTag($block, 'TRNTYPE');
        $dtPosted = $this->extractTag($block, 'DTPOSTED');
        $trnAmt = $this->extractTag($block, 'TRNAMT');
        $fitId = $this->extractTag($block, 'FITID');
        $name = $this->extractTag($block, 'NAME');
        $memo = $this->extractTag($block, 'MEMO');

        if ($dtPosted === null || $trnAmt === null) {
            return null;
        }

        // Parse date: YYYYMMDD or YYYYMMDDHHMMSS or YYYYMMDDHHMMSS.XXX[TZ]
        $dateStr = substr($dtPosted, 0, 8);
        $postedAt = CarbonImmutable::createFromFormat('Ymd', $dateStr);

        if (! $postedAt) {
            throw new \RuntimeException("Invalid OFX date: {$dtPosted}");
        }

        $amount = (float) str_replace([' ', ','], ['', '.'], $trnAmt);
        $direction = $amount >= 0
            ? BankStatementLineDirection::Credit
            : BankStatementLineDirection::Debit;
        $amount = abs($amount);

        $label = $name ?? $memo ?? $trnType ?? '';
        $counterparty = ($name !== null && $memo !== null) ? $name : null;

        return new ParsedLine(
            postedAt: $postedAt,
            amount: $amount,
            direction: $direction,
            currency: $defaultCurrency,
            label: $label,
            reference: $fitId,
            counterparty: $counterparty,
            raw: [
                'TRNTYPE' => $trnType,
                'DTPOSTED' => $dtPosted,
                'TRNAMT' => $trnAmt,
                'FITID' => $fitId,
                'NAME' => $name,
                'MEMO' => $memo,
            ],
        );
    }

    private function extractTag(string $block, string $tag): ?string
    {
        // OFX 1.x: <TAG>value (no closing tag) or OFX 2.x: <TAG>value</TAG>
        if (preg_match('#<'.preg_quote($tag, '#').'>([^<\r\n]+)#i', $block, $m)) {
            return trim($m[1]);
        }

        return null;
    }
}

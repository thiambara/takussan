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
    /**
     * P157.04 (TCK-1443) — le contenu en UTF-8 avant l'analyse. Un OFX 1.x déclare son jeu de
     * caractères dans l'en-tête `CHARSET` (`1252` : Windows-1252 ; `ISO-8859-1`), un OFX 2 dans
     * l'`encoding` de sa déclaration XML ; Windows-1252 à défaut d'une déclaration utilisable. Un
     * contenu déjà UTF-8 valide n'est pas touché. Sans cela, un libellé accentué en Windows-1252
     * faisait échouer l'insertion (SQLSTATE 22021), et le relevé entier avec.
     */
    private function toUtf8(string $content): string
    {
        if (mb_check_encoding($content, 'UTF-8')) {
            return $content;
        }

        $declare = null;
        if (preg_match('/^\s*CHARSET:\s*([A-Za-z0-9_-]+)/mi', $content, $m)) {
            $declare = strtoupper($m[1]);
        } elseif (preg_match('/<\?xml[^>]*\bencoding\s*=\s*["\']([A-Za-z0-9_-]+)["\']/i', $content, $m)) {
            $declare = strtoupper($m[1]);
        }

        $source = match ($declare) {
            'ISO-8859-1', 'ISO8859-1', '8859-1', 'LATIN1' => 'ISO-8859-1',
            default => 'Windows-1252',
        };

        return mb_convert_encoding($content, 'UTF-8', $source);
    }

    /** @return iterable<ParsedLine> */
    public function parse(string $absolutePath, ParserContext $context): iterable
    {
        $content = file_get_contents($absolutePath);

        if ($content === false) {
            throw new \RuntimeException("Cannot read file: {$absolutePath}");
        }

        $content = $this->toUtf8($content);

        $agencyCurrency = $context->agency->currency?->value ?? 'XOF';

        // TCK-1475 (P157.08) — la devise se lit PAR relevé de compte : chaque transaction prend le
        // `CURDEF` du `STMTRS` (ou `CCSTMTRS`, carte) qui la contient, la devise de l'agence à
        // défaut. Le premier `CURDEF` du fichier valait pour toutes, et la ligne d'un second compte
        // en euros entrait en francs CFA. Un fichier sans relevé de compte se lit d'un seul tenant.
        $accounts = preg_match_all('#<(CC|)STMTRS>(.*?)</\1STMTRS>#si', $content, $statements)
            ? $statements[2]
            : [$content];

        $transactions = [];
        foreach ($accounts as $account) {
            $currency = preg_match('#<CURDEF>([A-Z]{3})#i', $account, $m) ? strtoupper($m[1]) : $agencyCurrency;
            preg_match_all('#<STMTTRN>(.*?)</STMTTRN>#si', $account, $blocks);
            foreach ($blocks[1] as $block) {
                $transactions[] = [$block, $currency];
            }
        }

        $lineNumber = 0;

        foreach ($transactions as [$block, $defaultCurrency]) {
            $lineNumber++;

            try {
                $parsed = $this->parseBlock($block, $defaultCurrency);
            } catch (\Throwable $e) {
                // TCK-593 — même règle que `CsvDriver` : aucune valeur du relevé dans le journal (le
                // message de « Invalid OFX date » recopiait la date), et la transaction est comptée.
                Log::warning('bank_statement_line_skipped', [
                    'line' => $lineNumber,
                    'exception' => $e::class,
                ]);
                $parsed = null;
            }

            if ($parsed === null) {
                $context->tally->skip();

                continue;
            }

            yield $parsed;
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
        try {
            $postedAt = CarbonImmutable::createFromFormat('Ymd', $dateStr);
        } catch (\Throwable) {
            $postedAt = null;
        }

        // TCK-1473 (P157.02) — même règle que `CsvDriver` (TCK-593) : `createFromFormat` DÉBORDE sans
        // erreur (`20261332` devient le 2027-02-01). La date relue doit redonner la chaîne d'origine,
        // sinon la ligne est sautée et comptée. Le message ne porte pas la valeur : il finirait dans
        // un journal.
        if (! $postedAt || $postedAt->format('Ymd') !== $dateStr) {
            throw new \RuntimeException('Invalid OFX date');
        }

        $amount = $this->parseAmount($trnAmt);
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

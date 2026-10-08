<?php

namespace App\Services\Accounting\StatementParser;

use App\Models\Enums\BankStatementLineDirection;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Log;
use League\Csv\Reader;

class CsvDriver implements StatementParserInterface
{
    /**
     * Le mapping par défaut. TCK-593 : les séparateurs du montant sont DÉCLARÉS, plus devinés —
     * `decimal_separator => ','` reprend le comportement des fichiers à virgule décimale, et
     * aucun séparateur de milliers n'est supposé (les espaces, ordinaire et insécables, sont
     * toujours retirés).
     */
    public const DEFAULT_MAPPING = [
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
        'decimal_separator' => ',',
        'thousands_separator' => null,
    ];

    /**
     * TCK-593 — le mapping effectif d'une agence : le défaut du code, recouvert par ses réglages.
     * C'est ce qui est rendu par `GET csv-mapping` et figé sur un relevé à l'import.
     *
     * @param  array<string, mixed>|null  $mapping
     * @return array<string, mixed>
     */
    public static function effectiveMapping(?array $mapping): array
    {
        return array_merge(self::DEFAULT_MAPPING, $mapping ?? []);
    }

    /** @return iterable<ParsedLine> */
    public function parse(string $absolutePath, ParserContext $context): iterable
    {
        $mapping = self::effectiveMapping($context->csvMapping);

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
            } catch (\Throwable $e) {
                // TCK-593 — le journal ne porte AUCUNE valeur de la ligne bancaire : ni `record`
                // (libellés, contreparties, montants), ni le message de l'exception, qui peut la
                // recopier. Le numéro de ligne et le nombre de colonnes suffisent à la retrouver.
                // Raccord TCK-601 : ce contexte devient `SafeExceptionContext::of($e)`.
                Log::warning('bank_statement_line_skipped', [
                    'line' => $lineNumber,
                    'columns' => count($record),
                    'exception' => $e::class,
                ]);
                $parsedLine = null;
            }

            // TCK-593 — toute ligne sautée est COMPTÉE, qu'elle soit illisible ou à date ou
            // montant vide (colonne absente comprise) : aucune perte silencieuse.
            if ($parsedLine === null) {
                $context->tally->skip();

                continue;
            }

            yield $parsedLine;
        }
    }

    private function parseSingleRecord(array $record, array $mapping, string $defaultCurrency): ?ParsedLine
    {
        $rawDate = trim($record[$mapping['date_column']] ?? '');
        $rawAmount = trim($record[$mapping['amount_column']] ?? '');

        if ($rawDate === '' || $rawAmount === '') {
            return null;
        }

        try {
            $postedAt = CarbonImmutable::createFromFormat($mapping['date_format'], $rawDate);
        } catch (\Throwable) {
            $postedAt = null;
        }

        // TCK-593 — `createFromFormat` DÉBORDE sans erreur : `31/13/2026` devient le 2027-01-31,
        // et une ligne au jour et au mois inversés entrerait avec une date fausse. La date relue
        // dans le même format doit redonner la chaîne d'origine. Le message ne porte pas la
        // valeur : il finirait dans un journal.
        if (! $postedAt || $postedAt->format($mapping['date_format']) !== $rawDate) {
            throw new \RuntimeException('Invalid date');
        }

        $amount = $this->parseAmount($rawAmount, $mapping['decimal_separator'] ?? ',', $mapping['thousands_separator'] ?? null);

        if ($mapping['sign_convention'] === 'amount_signed') {
            $direction = $amount >= 0
                ? BankStatementLineDirection::Credit
                : BankStatementLineDirection::Debit;
            $amount = abs($amount);
        } else {
            $direction = $this->parseDirection($record[$mapping['direction_column'] ?? 'direction'] ?? null);
            $amount = abs($amount);
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

    /**
     * TCK-593 (vérification adverse, R2) — le sens lu dans sa colonne, sans tenir compte de la
     * casse ni des accents : `debit`/`débit`/`d`/`dr`, `credit`/`crédit`/`c`/`cr`. Toute autre
     * valeur, vide comprise, fait sauter la ligne : un « Débit » lu « crédit » échappait à la garde
     * de sens et pouvait s'apparier à une échéance de loyer. Le message ne porte pas la valeur.
     */
    private function parseDirection(?string $raw): BankStatementLineDirection
    {
        $value = strtr(mb_strtolower(trim((string) $raw)), ['é' => 'e', 'è' => 'e', 'ê' => 'e']);

        return match ($value) {
            'debit', 'd', 'dr' => BankStatementLineDirection::Debit,
            'credit', 'c', 'cr' => BankStatementLineDirection::Credit,
            default => throw new \RuntimeException('Invalid direction'),
        };
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
     * Lit un montant selon les séparateurs DÉCLARÉS par le mapping (TCK-593).
     *
     * L'ancienne version devinait le séparateur décimal (« le plus à droite des deux ») : `150,000`
     * — cent cinquante mille au format anglo-saxon — était lu 150, une erreur ×1000 sans un mot. Et
     * elle n'ôtait que l'espace ASCII, pas l'espace insécable (U+00A0, U+202F) des milliers
     * français : `150 000` donnait 150. Les trois espaces sont toujours retirés ; le séparateur
     * de milliers déclaré l'est ensuite ; le décimal déclaré devient le point. Tout reste non
     * numérique fait sauter la ligne — comptée, jamais devinée.
     */
    private function parseAmount(string $raw, string $decimalSeparator, ?string $thousandsSeparator): float
    {
        $s = str_replace([' ', "\u{00A0}", "\u{202F}"], '', trim($raw));

        if ($thousandsSeparator !== null && $thousandsSeparator !== '' && $thousandsSeparator !== $decimalSeparator) {
            $s = str_replace($thousandsSeparator, '', $s);
        }

        // TCK-593 (vérification adverse, R1) — un `.` ou une `,` qui n'est pas le séparateur
        // décimal déclaré n'est pas deviné : au mapping par défaut (virgule), `150.000` était lu
        // 150, l'erreur ×1000 que la déclaration devait fermer. La ligne est sautée et comptée.
        foreach (['.', ','] as $separator) {
            if ($separator !== $decimalSeparator && str_contains($s, $separator)) {
                throw new \RuntimeException('Invalid amount');
            }
        }

        if ($decimalSeparator !== '.') {
            $s = str_replace($decimalSeparator, '.', $s);
        }

        if (preg_match('/^[+-]?\d+(\.\d+)?$/', $s) !== 1) {
            throw new \RuntimeException('Invalid amount');
        }

        return (float) $s;
    }
}

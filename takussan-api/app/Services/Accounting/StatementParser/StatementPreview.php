<?php

namespace App\Services\Accounting\StatementParser;

use App\Models\Agency;
use App\Models\Enums\BankStatementSourceFormat;
use App\Support\Logging\SafeExceptionContext;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * TCK-2932 — ce que l'import LIRAIT d'un relevé, sans rien écrire : aucun `bank_statements`, aucune
 * ligne, aucun média, aucun job. Le pilote est celui de l'import, avec le même mapping CSV (celui de
 * l'agence, que l'import fige sur le relevé) ; le générateur est lu en entier mais seuls les comptes,
 * les bornes de la période et les {@see self::SAMPLE} premières lignes restent en mémoire.
 */
final class StatementPreview
{
    public const SAMPLE = 10;

    public function __construct(private readonly StatementParserFactory $factory) {}

    /**
     * @return array{source_format: string, read: int, skipped: int, skipped_by_reason: array<string, int>|\stdClass, skipped_lines: list<array{line: int, reason: string}>, period: array{start: ?string, end: ?string}, lines: list<array<string, mixed>>}
     */
    public function preview(Agency $agency, BankStatementSourceFormat $format, string $absolutePath): array
    {
        $context = new ParserContext(
            agency: $agency,
            format: $format,
            csvMapping: CsvDriver::effectiveMapping($agency->bank_csv_mapping),
        );

        $read = 0;
        $start = null;
        $end = null;
        $sample = [];

        // Un fichier que le pilote ne peut pas ouvrir (en-tête aux colonnes vides ou en double, fichier
        // vide) : l'import en ferait un relevé `failed` ; l'aperçu le dit en 422 codé. Le journal ne
        // porte que la forme sûre de la levée (ADR-0044 § 2), jamais une valeur du relevé.
        try {
            foreach ($this->factory->for($format)->parse($absolutePath, $context) as $parsed) {
                $read++;
                $date = $parsed->postedAt->toDateString();
                $start = $start === null || $date < $start ? $date : $start;
                $end = $end === null || $date > $end ? $date : $end;

                if (count($sample) < self::SAMPLE) {
                    $sample[] = [
                        'date' => $date,
                        // Décimal en chaîne, comme `bank_statement_lines.amount` une fois importé.
                        'amount' => number_format($parsed->amount, 2, '.', ''),
                        'direction' => $parsed->direction->value,
                        'currency' => $parsed->currency,
                        'label' => $parsed->label,
                        'reference' => $parsed->reference,
                        'counterparty' => $parsed->counterparty,
                    ];
                }
            }
        } catch (Throwable $e) {
            Log::warning('bank_statement_preview_unreadable', SafeExceptionContext::of($e));
            abort_code(422, 'reconciliation.preview_unreadable');
        }

        $tally = $context->tally;
        ksort($tally->byReason);

        return [
            'source_format' => $format->value,
            'read' => $read,
            'skipped' => $tally->skipped,
            'skipped_by_reason' => $tally->byReason ?: new \stdClass,
            'skipped_lines' => $tally->lines,
            'period' => ['start' => $start, 'end' => $end],
            'lines' => $sample,
        ];
    }
}

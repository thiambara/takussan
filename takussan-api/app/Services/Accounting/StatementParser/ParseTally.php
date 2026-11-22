<?php

namespace App\Services\Accounting\StatementParser;

use Throwable;

/**
 * TCK-593 — le compte des lignes qu'un pilote a SAUTÉES pendant l'analyse d'un relevé.
 *
 * Le parseur est un générateur : il ne peut rien « rendre » d'autre que les lignes lues. Ce
 * compteur, porté par le `ParserContext`, est ce qu'il rend au job — qui l'écrit sur le relevé
 * (`skipped_lines_count`) au lieu de laisser la ligne disparaître dans un journal.
 *
 * TCK-2932 — il garde aussi, pour l'aperçu d'un relevé (`POST …/bank-statements/preview`), la
 * RAISON de chaque ligne sautée et son rang : un code, jamais une valeur de la ligne bancaire.
 * Le détail est borné ({@see self::DETAIL_MAX}) ; le compte ne l'est pas.
 */
final class ParseTally
{
    /** Date ou montant absent (cellule vide, colonne absente du fichier). */
    public const MISSING_VALUE = 'missing_value';

    public const INVALID_DATE = 'invalid_date';

    public const INVALID_AMOUNT = 'invalid_amount';

    public const INVALID_DIRECTION = 'invalid_direction';

    public const INVALID_CURRENCY = 'invalid_currency';

    /** Toute autre levée du pilote. */
    public const UNREADABLE = 'unreadable';

    /** Lignes sautées détaillées au plus : un fichier entièrement illisible n'en rend pas 30 000. */
    public const DETAIL_MAX = 50;

    /** Le message d'une levée de pilote → sa raison. Les messages ne portent jamais de valeur. */
    private const REASONS = [
        'Invalid date' => self::INVALID_DATE,
        'Invalid OFX date' => self::INVALID_DATE,
        'Invalid amount' => self::INVALID_AMOUNT,
        'Invalid OFX amount' => self::INVALID_AMOUNT,
        'Invalid direction' => self::INVALID_DIRECTION,
        'Invalid currency' => self::INVALID_CURRENCY,
        'Invalid OFX currency' => self::INVALID_CURRENCY,
    ];

    public int $skipped = 0;

    /** @var array<string, int> */
    public array $byReason = [];

    /** @var list<array{line: int, reason: string}> */
    public array $lines = [];

    /**
     * @param  int|null  $line  le rang de la ligne dans le fichier (1 = première ligne de données, ou
     *                          première transaction OFX)
     * @param  Throwable|null  $cause  la levée du pilote ; nulle, la ligne n'avait ni date ni montant
     */
    public function skip(?int $line = null, ?Throwable $cause = null): void
    {
        $this->skipped++;

        $reason = $cause === null ? self::MISSING_VALUE : (self::REASONS[$cause->getMessage()] ?? self::UNREADABLE);
        $this->byReason[$reason] = ($this->byReason[$reason] ?? 0) + 1;

        if ($line !== null && count($this->lines) < self::DETAIL_MAX) {
            $this->lines[] = ['line' => $line, 'reason' => $reason];
        }
    }
}

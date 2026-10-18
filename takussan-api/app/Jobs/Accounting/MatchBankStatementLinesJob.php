<?php

namespace App\Jobs\Accounting;

use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Enums\BankStatementLineMatchStatus;
use App\Services\Accounting\ReconciliationMatcher;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * TCK-933 (P43.02) — rapproche UN lot de lignes d'un relevé, mis en file par
 * {@see MatchBankStatementJob}.
 *
 * Le relevé est lu une fois pour le lot et posé sur chaque ligne : `suggestFor()` lisait
 * `$line->statement`, que rien ne préchargeait, soit une requête de plus par ligne.
 */
class MatchBankStatementLinesJob implements ShouldQueue
{
    use Queueable;

    /** Lignes par lot : environ 15 ms par ligne mesurés sur base vide, loin du délai. */
    public const LOT = 200;

    /** Idempotent : seules les lignes encore `unmatched` sont traitées. */
    public int $tries = 3;

    public array $backoff = [30, 120];

    /** ⚠ Strictement inférieur au `retry_after` de la connexion (90 s, `config/queue.php`). */
    public int $timeout = 75;

    /** @param list<int> $lineIds */
    public function __construct(public int $statementId, public array $lineIds)
    {
        $this->onQueue('reconciliation');
    }

    public function handle(ReconciliationMatcher $matcher): void
    {
        $statement = BankStatement::query()->find($this->statementId);

        if (! $statement || $this->lineIds === []) {
            return;
        }

        BankStatementLine::query()
            ->where('bank_statement_id', $statement->id)
            ->whereKey($this->lineIds)
            ->where('match_status', BankStatementLineMatchStatus::Unmatched)
            ->orderBy('id')
            ->get()
            ->each(function (BankStatementLine $line) use ($matcher, $statement): void {
                $line->setRelation('statement', $statement);

                $suggestion = $matcher->suggestFor($line);

                if ($suggestion !== null) {
                    $line->update([
                        'match_status' => BankStatementLineMatchStatus::Suggested,
                        'matched_payment_type' => $suggestion->paymentType,
                        'matched_payment_id' => $suggestion->paymentId,
                        'match_confidence' => $suggestion->confidence,
                    ]);
                }
            });
    }
}

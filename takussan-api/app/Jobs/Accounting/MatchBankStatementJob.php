<?php

namespace App\Jobs\Accounting;

use App\Jobs\Media\RegenerateAgencyWatermarksJob;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Enums\BankStatementLineMatchStatus;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Répartit le rapprochement d'un relevé : un {@see MatchBankStatementLinesJob} par lot de lignes
 * `unmatched`.
 *
 * ⚠ **Ce job ne rapproche plus rien lui-même (TCK-933, P43.02).** Il parcourait toutes les lignes
 * dans un seul job, sans délai propre : au délai du worker (60 s, `compose.api.yml` ne pose pas
 * `--timeout`), le processus était tué, `$tries = 1` le passait en échec, et les lignes suivantes
 * restaient `unmatched` sur un relevé déjà `ready_for_review`. Mesuré : 4 requêtes par ligne, dont
 * une relecture du relevé, soit 500 lignes en 7,7 s sur une base vide. Chaque lot a désormais son
 * délai et ses rejeux, comme {@see RegenerateAgencyWatermarksJob} répartit les
 * photos d'une agence.
 */
class MatchBankStatementJob implements ShouldQueue
{
    use Queueable;

    /** Un rejeu remet en file les lignes encore `unmatched` ; un lot rejoué ne double rien. */
    public int $tries = 3;

    public array $backoff = [30, 120];

    /**
     * ⚠ Strictement inférieur au `retry_after` de la connexion (90 s, `config/queue.php`) : il ne
     * fait que lire des identifiants et insérer des jobs. `MatchBankStatementBatchesTest` compare.
     */
    public int $timeout = 75;

    public function __construct(public int $statementId)
    {
        $this->onQueue('reconciliation');
    }

    public function handle(): void
    {
        if (BankStatement::query()->whereKey($this->statementId)->doesntExist()) {
            return;
        }

        BankStatementLine::query()
            ->where('bank_statement_id', $this->statementId)
            ->where('match_status', BankStatementLineMatchStatus::Unmatched)
            ->select('id')
            ->chunkById(MatchBankStatementLinesJob::LOT, function ($lines): void {
                MatchBankStatementLinesJob::dispatch(
                    $this->statementId,
                    $lines->pluck('id')->map(fn ($id) => (int) $id)->all(),
                );
            });
    }
}

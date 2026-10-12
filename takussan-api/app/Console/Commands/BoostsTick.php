<?php

namespace App\Console\Commands;

use App\Services\Boost\BoostLifecycle;
use App\Services\Boost\BoostStatsRecorder;
use App\Services\Credits\CreditExpiryNotifier;
use App\Services\Credits\CreditLedger;
use Illuminate\Console\Command;

/**
 * TCK-633 lot F (ADR-0061 §9) — toutes les 5 minutes. Chaque étape est idempotente par
 * construction (transitions réclamées par `UPDATE … WHERE`, lots expirés soldés à zéro, préavis
 * marqué) : un tick rejoué, ou deux ticks qui se chevauchent malgré `withoutOverlapping()`, ne
 * produisent rien de plus.
 */
class BoostsTick extends Command
{
    protected $signature = 'boosts:tick';

    protected $description = 'Clôt les boosts échus, réconcilie, expire les lots de crédits et envoie les préavis (ADR-0061 §9).';

    public function handle(BoostLifecycle $lifecycle, CreditLedger $ledger, CreditExpiryNotifier $notifier, BoostStatsRecorder $stats): int
    {
        $ended = $lifecycle->endExpired();
        $reconciled = $lifecycle->reconcileAll();
        $expired = $ledger->expireDue();
        $notices = $notifier->sendNotices();
        $flushed = $stats->flush();

        $this->info("boosts:tick ended={$ended} reconciled={$reconciled} expired_lots={$expired} notices={$notices} stats_rows={$flushed}");

        return self::SUCCESS;
    }
}

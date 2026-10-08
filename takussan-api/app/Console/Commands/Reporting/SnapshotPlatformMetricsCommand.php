<?php

namespace App\Console\Commands\Reporting;

use App\Services\Reporting\PlatformMetricsSnapshotter;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Throwable;

/**
 * TCK-595 (ADR-0057 §3) — `metrics:snapshot {--date=}` rejoue l'instantané d'un jour.
 *
 * La veille (défaut) : flux et stocks, comme le job. Un jour antérieur : les flux seulement, un statut
 * courant ne disant rien d'un jour passé. Aujourd'hui ou le futur : refusé, le jour n'est pas clos.
 */
class SnapshotPlatformMetricsCommand extends Command
{
    protected $signature = 'metrics:snapshot {--date= : Jour à rejouer (Y-m-d), la veille par défaut}';

    protected $description = 'Écrit l\'instantané quotidien des métriques plateforme (TCK-595, ADR-0057)';

    public function handle(PlatformMetricsSnapshotter $snapshotter): int
    {
        $yesterday = now()->subDay()->startOfDay();
        $option = $this->option('date');

        try {
            $day = is_string($option) && $option !== '' ? Carbon::createFromFormat('!Y-m-d', $option) : $yesterday;
        } catch (Throwable) {
            $day = false;
        }
        if ($day === false || $day === null) {
            $this->error('Date invalide : attendu Y-m-d.');

            return self::INVALID;
        }
        if ($day->greaterThan($yesterday)) {
            $this->error('Le jour demandé n\'est pas clos : seule une date antérieure à aujourd\'hui s\'instantanée.');

            return self::INVALID;
        }

        $withStocks = $day->isSameDay($yesterday);
        $row = $snapshotter->snapshot($day, $withStocks);

        $this->info(sprintf(
            '%s : GMV %s, frais %s%s.',
            $row->date->toDateString(),
            $row->gmv_amount,
            $row->platform_fees_amount,
            $withStocks ? ', stocks mesurés' : ', flux seulement',
        ));

        return self::SUCCESS;
    }
}

<?php

namespace App\Jobs\Reporting;

use App\Services\Reporting\PlatformMetricsSnapshotter;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * TCK-595 (ADR-0057 §3) — l'instantané de LA VEILLE, à 00:30 : ses flux, et les stocks mesurés à
 * l'exécution (l'état à la fin de la veille, à trente minutes près). Rejoué, il réécrit la même ligne.
 */
class SnapshotPlatformMetricsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(PlatformMetricsSnapshotter $snapshotter): void
    {
        $snapshotter->snapshot(now()->subDay(), withStocks: true);
    }
}

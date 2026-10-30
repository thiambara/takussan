<?php

namespace App\Jobs\Radar;

use App\Jobs\Concerns\RunsOnLongQueue;
use App\Models\Enums\RadarCrawlStatus;
use App\Models\RadarCrawlRun;
use App\Services\Radar\Crawl\RadarCrawler;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * TCK-2392 (ADR-0078, AC8) — un passage de collecte, mis en file par `RadarCrawlScheduler`. Plusieurs pages lues à
 * `radar.fetch.min_delay_seconds` d'intervalle, chacune jusqu'à 45 s : il dépasse le délai de reprise de `database`
 * (90 s) et vit donc sur la file longue (`RunsOnLongQueue`, `retry_after` 1900 s). Il n'appelle pas le modèle : les
 * extractions des annonces trouvées partent sur la file `ai`, chacune dans son job.
 *
 * Une tentative : un passage interrompu n'est pas rejoué (le suivant reprendra la liste), il est clos en `failed` par
 * `failed()`, et `RadarCrawlScheduler::failStale()` reste le filet d'un worker tué sans appel à `failed()`.
 */
final class CrawlRadarSource implements ShouldQueue
{
    use Queueable, RunsOnLongQueue;

    /** Sous le `retry_after` de `database-long` (1900 s) ; le budget de travail du passage (1200 s) passe avant. */
    public int $timeout = 1500;

    public int $tries = 1;

    public function __construct(public readonly int $runId)
    {
        $this->onLongQueue();
    }

    public function handle(RadarCrawler $crawler): void
    {
        $run = RadarCrawlRun::query()->find($this->runId);
        if ($run !== null) {
            $crawler->run($run);
        }
    }

    public function failed(?Throwable $e): void
    {
        RadarCrawlRun::query()
            ->whereKey($this->runId)
            ->whereIn('status', RadarCrawlStatus::activeValues())
            ->update([
                'status' => RadarCrawlStatus::Failed->value,
                'finished_at' => now(),
                'stop_reason' => RadarCrawlRun::STOP_ERROR,
                'updated_at' => now(),
            ]);
    }
}

<?php

namespace App\Services\Radar\Crawl;

use App\Jobs\Radar\CrawlRadarSource;
use App\Models\Enums\RadarCrawlStatus;
use App\Models\Enums\RadarCrawlTrigger;
use App\Models\Enums\RadarSourceSite;
use App\Models\RadarCrawlRun;
use App\Models\RadarCrawlSource;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2392 (AC4) — quand un passage part, et qu'il n'en part jamais deux.
 *
 * - **Rien ne part d'une source éteinte**, ni d'une source sans opérateur (l'extraction serait refusée). Une source allumée
 *   ne repart qu'une fois `frequency_minutes` écoulées depuis le DÉBUT de son passage précédent (sa mise en file), quelle
 *   qu'en ait été l'issue : un site qui refuse n'est pas relu en boucle.
 * - **Un seul passage actif par site** (`queued` ou `running`) : l'insertion passe par `ON CONFLICT DO NOTHING` sur l'index
 *   unique partiel `radar_crawl_runs_one_active_unique` — deux planificateurs simultanés, ou un clic pendant un passage
 *   planifié, n'en créent qu'un, sans exception dans la transaction (piège n° 1 du CLAUDE.md de l'API).
 * - **Un passage perdu** (actif depuis plus de `radar.crawl.stale_after_minutes` : worker tué, file arrêtée) est clos en
 *   `failed`, sans quoi il bloquerait son site pour toujours.
 */
final class RadarCrawlScheduler
{
    public const STOP_LOST = 'radar.crawl.lost';

    public function __construct(private readonly RadarCrawlSources $sources) {}

    /** @return int le nombre de passages perdus clos */
    public function failStale(CarbonInterface $now): int
    {
        return RadarCrawlRun::query()
            ->whereIn('status', RadarCrawlStatus::activeValues())
            ->where('created_at', '<=', $now->copy()->subMinutes((int) config('radar.crawl.stale_after_minutes', 60)))
            ->update([
                'status' => RadarCrawlStatus::Failed->value,
                'finished_at' => $now,
                'stop_reason' => self::STOP_LOST,
                'updated_at' => $now,
            ]);
    }

    /** @return list<RadarCrawlRun> les passages mis en file */
    public function enqueueDue(CarbonInterface $now): array
    {
        $queued = [];
        foreach ($this->sources->all() as $source) {
            if (! $source->enabled || $source->operator_id === null || ! $this->due($source, $now)) {
                continue;
            }
            $run = $this->start($source->site, RadarCrawlTrigger::Schedule, $source->operator_id);
            if ($run !== null) {
                $queued[] = $run;
            }
        }

        return $queued;
    }

    /**
     * Un passage mis en file pour ce site, au nom de cet opérateur ; null si un passage y est déjà actif.
     */
    public function start(RadarSourceSite $site, RadarCrawlTrigger $trigger, int $operatorId): ?RadarCrawlRun
    {
        $now = now();
        $row = DB::selectOne(
            'INSERT INTO radar_crawl_runs (site, trigger, status, operator_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) '
            .'ON CONFLICT DO NOTHING RETURNING id',
            [$site->value, $trigger->value, RadarCrawlStatus::Queued->value, $operatorId, $now, $now],
        );
        if ($row === null) {
            return null;
        }

        CrawlRadarSource::dispatch((int) $row->id)->afterCommit();

        return RadarCrawlRun::query()->findOrFail((int) $row->id);
    }

    public function startManually(RadarSourceSite $site, User $by): ?RadarCrawlRun
    {
        return $this->start($site, RadarCrawlTrigger::Manual, $by->id);
    }

    private function due(RadarCrawlSource $source, CarbonInterface $now): bool
    {
        $last = RadarCrawlRun::query()->where('site', $source->site->value)->max('created_at');

        return $last === null || $now->copy()->subMinutes(max(1, $source->frequency_minutes))->greaterThanOrEqualTo($last);
    }
}

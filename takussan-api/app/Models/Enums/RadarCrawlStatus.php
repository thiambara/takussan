<?php

namespace App\Models\Enums;

/**
 * TCK-2392 — l'état d'un passage de collecte. `queued` et `running` sont « actifs » : un seul par site
 * (`radar_crawl_runs_one_active_unique`). `finished` : le passage s'est arrêté normalement (fin de liste, plafond de
 * pages, page refusée — son motif dans `stop_reason`) ; `failed` : une erreur imprévue l'a interrompu.
 */
enum RadarCrawlStatus: string
{
    case Queued = 'queued';
    case Running = 'running';
    case Finished = 'finished';
    case Failed = 'failed';

    /** @return list<string> */
    public static function activeValues(): array
    {
        return [self::Queued->value, self::Running->value];
    }
}

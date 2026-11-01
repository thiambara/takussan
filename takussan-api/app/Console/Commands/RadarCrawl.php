<?php

namespace App\Console\Commands;

use App\Services\Radar\Crawl\RadarCrawlScheduler;
use App\Services\Radar\RadarAutoMerge;
use Illuminate\Console\Command;

/**
 * TCK-2392 (ADR-0077 §10) — le battement de la collecte automatique, toutes les 15 minutes :
 *  1. clôt les passages perdus (`RadarCrawlScheduler::failStale()`) ;
 *  2. met en file le passage de chaque source ALLUMÉE dont la fréquence est écoulée — aucune ne l'est par défaut :
 *     sans geste du porteur, la commande ne lance rien ;
 *  3. juge la fusion des annonces collectées extraites depuis (`RadarAutoMerge::sweep()`).
 *
 * Idempotente : un passage par site au plus (index unique partiel), une fusion jugée une fois (`merge_checked_at`).
 */
class RadarCrawl extends Command
{
    protected $signature = 'radar:crawl';

    protected $description = 'Met en file les passages de collecte dus du Radar et fusionne les doublons entre sites.';

    public function handle(RadarCrawlScheduler $scheduler, RadarAutoMerge $merge): int
    {
        $now = now();
        $lost = $scheduler->failStale($now);
        $queued = $scheduler->enqueueDue($now);
        $merged = $merge->sweep($now);

        $this->info(sprintf('radar:crawl — lost=%d queued=%d merged=%d.', $lost, count($queued), $merged));

        return self::SUCCESS;
    }
}

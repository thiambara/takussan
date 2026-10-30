<?php

namespace App\Console\Commands;

use App\Services\Radar\Observatory\RadarNatureCounter;
use Illuminate\Console\Command;

/**
 * TCK-2431 (ADR-0077 §9, ADR-0083) — le compteur anonyme quotidien des annonceurs par nature, planifié AVANT `radar:purge`.
 * Idempotent : relancé le même jour, il n'écrit rien. Tout est dans {@see RadarNatureCounter}.
 */
class RadarCountNatures extends Command
{
    protected $signature = 'radar:count-natures';

    protected $description = 'Fige le compte anonyme du jour des annonceurs du Radar par nature présumée (avant la purge).';

    public function handle(RadarNatureCounter $counter): int
    {
        if (! RadarNatureCounter::enabled()) {
            $this->info('radar:count-natures — comptage éteint (radar.nature_counts.enabled), rien d\'écrit.');

            return self::SUCCESS;
        }
        $written = $counter->record();

        $this->info("radar:count-natures — {$written} ligne(s) écrite(s).");

        return self::SUCCESS;
    }
}

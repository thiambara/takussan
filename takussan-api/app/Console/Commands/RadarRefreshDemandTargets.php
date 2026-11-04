<?php

namespace App\Console\Commands;

use App\Jobs\Radar\RefreshRadarDemandTargets;
use Illuminate\Console\Command;

/**
 * TCK-2470 (ADR-0087 §6) — met en file `ai` un passage des cibles de la demande. Éteint, ou sans opérateur, le passage
 * ne lit rien et n'appelle rien ; des signaux inchangés ne rappellent pas le modèle.
 */
class RadarRefreshDemandTargets extends Command
{
    protected $signature = 'radar:refresh-demand-targets';

    protected $description = 'Met en file un passage des cibles du Radar tirées de la demande sans résultat.';

    public function handle(): int
    {
        RefreshRadarDemandTargets::dispatch();
        $this->line('radar:refresh-demand-targets — passage mis en file.');

        return self::SUCCESS;
    }
}

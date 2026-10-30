<?php

namespace App\Console\Commands;

use App\Services\Radar\Observatory\RadarAvailabilityCheck;
use App\Services\Radar\Observatory\RadarSourceWatch;
use Illuminate\Console\Command;

/**
 * TCK-2393 (ADR-0083 §3, §4) — constate les annonces collectées disparues de leur site, d'après le dernier passage qui a lu
 * toute la liste, et alerte sur le bien publié qu'elles représentent. Tout est dans {@see RadarSourceWatch}.
 *
 * Idempotente : une disparition se réclame une fois (`source_gone_at` encore nul), une seconde exécution ne trouve rien.
 *
 * TCK-2432 — puis propose à l'équipe le retrait des biens dont le titulaire n'a pas répondu dans le délai
 * ({@see RadarAvailabilityCheck::proposeWithdrawals()}) : une proposition, jamais un retrait.
 */
class RadarObserveSources extends Command
{
    protected $signature = 'radar:observe-sources';

    protected $description = 'Constate les annonces du Radar disparues de leur site et alerte sur les biens publiés qu’elles représentent.';

    public function handle(RadarSourceWatch $watch, RadarAvailabilityCheck $checks): int
    {
        $counts = $watch->observe();
        $counts['proposals'] = $checks->proposeWithdrawals();

        $this->info('radar:observe-sources — '.collect($counts)->map(fn (int $n, string $name) => "{$name}={$n}")->implode(' ').'.');

        return self::SUCCESS;
    }
}

<?php

namespace App\Console\Commands;

use App\Services\Radar\RadarPurger;
use Illuminate\Console\Command;

/**
 * TCK-2391 (ADR-0077 §9) — la purge quotidienne du Radar : les annonces jamais publiées de plus de 90 jours, celles d'un
 * annonceur qui a dit STOP, les messages et les réponses non confirmées qui s'y rattachent, la preuve d'un accord 3 ans après le
 * retrait du dernier bien, et le numéro d'un annonceur sans annonce restante. Tout est dans {@see RadarPurger}.
 *
 * Idempotente : une seconde exécution ne trouve plus rien. Elle journalise ses COMPTES (jamais un numéro ni un texte), à la
 * console et au journal d'activité quand elle a effacé quelque chose.
 */
class RadarPurge extends Command
{
    protected $signature = 'radar:purge';

    protected $description = 'Efface ce que la politique de confidentialité annonce pour le Radar (annonces jamais publiées, preuves échues).';

    public function handle(RadarPurger $purger): int
    {
        $counts = $purger->run();

        $this->info('radar:purge — '.collect($counts)->map(fn (int $n, string $name) => "{$name}={$n}")->implode(' ').'.');

        return self::SUCCESS;
    }
}

<?php

namespace App\Console\Commands;

use App\Services\Search\SearchJournal;
use Illuminate\Console\Command;

/**
 * TCK-2472 (ADR-0088 §2 et §5) — le journal des recherches : l'empreinte du jour d'un visiteur s'efface dès 47 heures
 * (horaire : aucune n'atteint 48 heures), une ligne du journal au-delà de `search.journal.retention_months` (13) mois.
 * Idempotente : une suppression par date, une seconde exécution ne trouve plus rien. Tout est dans {@see SearchJournal::purge()}.
 */
class PurgeSearchJournal extends Command
{
    protected $signature = 'search:purge-journal';

    protected $description = 'Efface les empreintes de visiteur avant 48 h et les lignes échues du journal des recherches.';

    public function handle(SearchJournal $journal): int
    {
        ['visitors' => $visitors, 'stats' => $stats] = $journal->purge();

        $this->info("search:purge-journal — empreintes effacées : {$visitors} ; lignes effacées : {$stats}.");

        return self::SUCCESS;
    }
}

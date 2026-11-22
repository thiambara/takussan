<?php

namespace App\Console\Commands;

use App\Services\Owners\ResumeDuLundi;
use Illuminate\Console\Command;

/**
 * TCK-2985 (ADR-0132 § 6) — le résumé du lundi du bailleur, planifié lundi 09:00 heure de Dakar (`routes/console.php`).
 * Idempotent par semaine : relancée la même semaine, elle n'envoie rien de plus.
 */
class OwnersWeeklyDigest extends Command
{
    protected $signature = 'owners:weekly-digest';

    protected $description = 'Envoie à chaque bailleur qui l\'a activé le résumé de sa semaine, par agence.';

    public function handle(ResumeDuLundi $resume): int
    {
        $envoyes = $resume->envoyer();
        $this->info("Résumés envoyés : {$envoyes}.");

        return self::SUCCESS;
    }
}

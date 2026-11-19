<?php

namespace App\Console\Commands;

use App\Services\Messaging\SignalDesEngagements;
use Illuminate\Console\Command;

/**
 * TCK-2970 (ADR-0130 § 4) — le rappel, le retard, les relances et la question « Tenu ? » des engagements,
 * écrits au fil ({@see SignalDesEngagements}). Planifiée toutes les 5 minutes (`routes/console.php`).
 *
 * Idempotente : chaque signal est rejugé sous verrou de ligne, marqueur compris ; deux passages
 * simultanés n'écrivent qu'un événement par marqueur.
 */
class SignalCommitments extends Command
{
    protected $signature = 'commitments:signal';

    protected $description = 'Write due-soon, overdue, reminder and "kept?" events for open commitments.';

    public function handle(SignalDesEngagements $signal): int
    {
        $bilan = $signal->passer();
        foreach ($bilan['ecrits'] as $code => $nombre) {
            $this->line("commitment.{$code}: {$nombre}");
        }
        if ($bilan['echecs'] > 0) {
            $this->warn("Échecs : {$bilan['echecs']} (rapportés, retentés au prochain passage).");
        }

        return self::SUCCESS;
    }
}

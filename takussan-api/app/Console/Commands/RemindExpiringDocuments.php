<?php

namespace App\Console\Commands;

use App\Services\Documents\DocumentExpiryReminder;
use Illuminate\Console\Command;

/**
 * TCK-2783 — prévient le destinataire d'une pièce datée qui expire dans 60 puis 7 jours (jour de
 * Dakar). Quotidien, idempotent : un jalon envoyé est mémorisé sur la pièce, avec la date visée.
 */
class RemindExpiringDocuments extends Command
{
    protected $signature = 'documents:remind-expiring';

    protected $description = 'Prévient le destinataire d\'une pièce qui expire dans 60 puis 7 jours.';

    public function handle(DocumentExpiryReminder $reminder): int
    {
        $counts = $reminder->run();
        $this->info("Rappels envoyés : {$counts['reminded']}.");

        return self::SUCCESS;
    }
}

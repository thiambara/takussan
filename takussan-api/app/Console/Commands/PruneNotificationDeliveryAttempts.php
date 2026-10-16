<?php

namespace App\Console\Commands;

use App\Models\NotificationDeliveryAttempt;
use Illuminate\Console\Command;

/**
 * TCK-691 (P19.02) — chaque tentative d'envoi SMS ou WhatsApp garde le numéro du destinataire
 * (`to`). Décision du porteur : les tentatives sont purgées après 90 jours. La notification
 * (`app_notifications`) n'est pas touchée.
 *
 * Planifiée chaque jour (`routes/console.php`) ; idempotente — une suppression par date, qu'une
 * seconde exécution trouve vide.
 */
class PruneNotificationDeliveryAttempts extends Command
{
    public const RETENTION_DAYS = 90;

    protected $signature = 'notifications:prune-delivery-attempts';

    protected $description = 'Supprime les tentatives d\'envoi SMS et WhatsApp de plus de 90 jours.';

    public function handle(): int
    {
        $deleted = NotificationDeliveryAttempt::query()
            ->where('created_at', '<', now()->subDays(self::RETENTION_DAYS))
            ->delete();

        $this->info("notifications:prune-delivery-attempts a supprimé {$deleted} ligne(s).");

        return self::SUCCESS;
    }
}

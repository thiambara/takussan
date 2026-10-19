<?php

namespace App\Console\Commands;

use App\Models\AppNotification;
use Illuminate\Console\Command;

/**
 * TCK-918 (P19.06) — décision du porteur : une notification in-app lue se conserve 6 mois après
 * sa lecture (`read_at`), puis disparaît, ses tentatives d'envoi avec elle (clé étrangère en
 * cascade). Une notification non lue n'est jamais touchée. La durée est écrite dans la politique
 * de confidentialité (`takussan-web/src/content/legal/privacy.ts`, § 6).
 *
 * Planifiée chaque jour (`routes/console.php`) ; idempotente — une suppression par date, qu'une
 * seconde exécution trouve vide.
 */
class PruneReadNotifications extends Command
{
    public const RETENTION_MONTHS = 6;

    protected $signature = 'notifications:prune-read';

    protected $description = 'Supprime les notifications in-app lues depuis plus de 6 mois.';

    public function handle(): int
    {
        $deleted = AppNotification::query()
            ->whereNotNull('read_at')
            ->where('read_at', '<', now()->subMonths(self::RETENTION_MONTHS))
            ->delete();

        $this->info("notifications:prune-read a supprimé {$deleted} ligne(s).");

        return self::SUCCESS;
    }
}

<?php

namespace App\Console\Commands;

use App\Models\IntegrationWebhookLog;
use Illuminate\Console\Command;

/**
 * TCK-602 (ADR-0051 §6) — purge le journal des webhooks au-delà de la rétention de chaque canal
 * (`config/webhooks.php`). Un canal absent de la configuration garde la plus longue des rétentions
 * déclarées : on n'efface jamais par défaut ce qu'on n'a pas décidé d'effacer.
 *
 * Planifiée chaque jour (`routes/console.php`) ; idempotente — une seconde exécution ne trouve plus
 * rien à supprimer.
 */
class PruneWebhookLogs extends Command
{
    protected $signature = 'webhooks:prune';

    protected $description = 'Supprime les lignes du journal des webhooks au-delà de la rétention de leur canal.';

    public function handle(): int
    {
        /** @var array<string, int> $retention */
        $retention = (array) config('webhooks.retention_days', []);
        $longest = max([0, ...array_values($retention)]);

        $deleted = 0;
        foreach ($retention as $channel => $days) {
            $deleted += IntegrationWebhookLog::query()
                ->where('channel', $channel)
                ->where('created_at', '<', now()->subDays(max(1, (int) $days)))
                ->delete();
        }

        if ($longest > 0) {
            $deleted += IntegrationWebhookLog::query()
                ->whereNotIn('channel', array_keys($retention))
                ->where('created_at', '<', now()->subDays($longest))
                ->delete();
        }

        $this->info("webhooks:prune a supprimé {$deleted} ligne(s).");

        return self::SUCCESS;
    }
}

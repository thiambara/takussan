<?php

namespace App\Console\Commands;

use App\Models\AlertSubscriber;
use Illuminate\Console\Command;

/**
 * TCK-599 (ADR-0050 §4) — une alerte sans compte jamais confirmée disparaît à 48 h, avec sa
 * recherche (FK en cascade) : le contact d'un visiteur qui n'a pas consenti ne reste pas en base.
 * Horaire, idempotent : une seconde exécution ne trouve plus rien.
 */
class PurgeUnconfirmedSearchAlerts extends Command
{
    protected $signature = 'search-alerts:purge-unconfirmed';

    protected $description = 'Efface les alertes de recherche sans compte non confirmées dans le délai.';

    public function handle(): int
    {
        $purged = AlertSubscriber::query()
            ->whereNull('confirmed_at')
            ->where('created_at', '<=', now()->subHours((int) config('search_alerts.confirmation_ttl_hours', 48)))
            ->delete();

        $this->info("Demandes purgées : {$purged}.");

        return self::SUCCESS;
    }
}

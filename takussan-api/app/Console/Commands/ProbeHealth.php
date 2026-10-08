<?php

namespace App\Console\Commands;

use App\Services\Admin\HealthcheckService;
use Illuminate\Console\Command;

/**
 * TCK-600 — rafraîchit chaque minute l'instantané de santé et le statut que la route publique
 * `/api/health` lit en cache. La route ne sonde jamais elle-même : une requête anonyme ne doit
 * déclencher aucun appel sortant.
 */
class ProbeHealth extends Command
{
    protected $signature = 'health:probe';

    protected $description = 'Sonde la plateforme et met à jour le statut de santé en cache';

    public function handle(HealthcheckService $health): int
    {
        $this->line('status: '.$health->refresh()['status']);

        return self::SUCCESS;
    }
}

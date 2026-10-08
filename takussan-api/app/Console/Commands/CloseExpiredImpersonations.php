<?php

namespace App\Console\Commands;

use App\Services\Admin\ImpersonationService;
use Illuminate\Console\Command;

/**
 * TCK-600 (ADR-0055 §4) — ferme les sessions d'impersonation échues.
 *
 * Le jeton d'une session échue est déjà refusé par Sanctum (`expires_at`) et par
 * `AccessTokenGate` ; c'est la FERMETURE qui manque : `ended_at`, `end_reason = expired`,
 * l'activité de fin et l'avis à la cible. `stop()` est idempotent sous verrou : un `stop` de
 * l'opérateur concurrent n'envoie pas un second avis.
 */
class CloseExpiredImpersonations extends Command
{
    protected $signature = 'impersonation:close-expired';

    protected $description = 'Ferme les sessions d\'impersonation échues et prévient leur cible.';

    public function handle(ImpersonationService $impersonation): int
    {
        $fermees = $impersonation->closeExpired();

        $this->info("impersonation:close-expired — {$fermees} session(s) fermée(s).");

        return self::SUCCESS;
    }
}

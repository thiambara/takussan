<?php

namespace App\Console\Commands;

use App\Services\Auth\AccessTokenGate;
use Illuminate\Console\Command;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * TCK-589, vérification adverse m7 — purge les jetons morts d'INACTIVITÉ.
 *
 * {@see AccessTokenGate} refuse un jeton resté inactif au-delà de son
 * `idle_timeout_minutes` (défaut `auth.sessions.idle_minutes` pour un jeton hérité), mais
 * `sanctum:prune-expired` ne lit que la durée absolue : un jeton de super-admin inactif
 * depuis 30 min restait en table 30 jours. Même règle que la porte, même grâce de 24 h que
 * `sanctum:prune-expired --hours=24`. Un jeton sans borne (`<= 0`) n'est jamais purgé ici.
 */
class PruneIdleSessionTokens extends Command
{
    protected $signature = 'sessions:prune-idle {--hours=24 : Grâce après l\'échéance d\'inactivité}';

    protected $description = 'Supprime les jetons de session morts d\'inactivité (idle_timeout_minutes).';

    public function handle(): int
    {
        $default = (int) config('auth.sessions.idle_minutes');
        $cutoff = now()->subHours((int) $this->option('hours'));

        $deleted = PersonalAccessToken::query()
            ->whereRaw('COALESCE(idle_timeout_minutes, ?) > 0', [$default])
            ->whereRaw(
                'COALESCE(last_used_at, created_at) + make_interval(mins => COALESCE(idle_timeout_minutes, ?)) < ?',
                [$default, $cutoff],
            )
            ->delete();

        $this->info("sessions:prune-idle — {$deleted} jeton(s) supprimé(s).");

        return self::SUCCESS;
    }
}

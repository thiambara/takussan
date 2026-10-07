<?php

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\PersonalAccessToken;
use Laravel\Sanctum\Sanctum;

/**
 * TCK-589 — le rappel UNIQUE de `Sanctum::authenticateAccessTokensUsing`.
 *
 * ⚠ Un second appel à `authenticateAccessTokensUsing` écrase le premier sans
 * bruit. TCK-600 revendique le même rappel (refus des jetons d'un compte
 * `Blocked` / `Deleted`) : toute clause nouvelle s'AJOUTE ici, jamais dans un
 * autre appel. Les gardes : `BlockedAccountAuthenticationTest`,
 * `TokenLifetimeTest` (TCK-589) et `BlockedUserTokenRejectedTest` (TCK-600).
 *
 * Sanctum a déjà jugé `expires_at` et la durée absolue `sanctum.expiration`
 * (sur `created_at`, jetons hérités compris) : `$isValid` les porte.
 */
class AccessTokenGate
{
    public static function register(): void
    {
        Sanctum::authenticateAccessTokensUsing(
            fn (PersonalAccessToken $token, bool $isValid): bool => app(self::class)->allows($token, $isValid),
        );
    }

    public function allows(PersonalAccessToken $token, bool $isValid): bool
    {
        if (! $isValid) {
            return false;
        }

        // Un compte bloqué ou supprimé perd ses jetons déjà émis : le blocage
        // les supprime, mais un jeton qui aurait survécu ne doit rien rouvrir.
        $user = $token->tokenable;
        if ($user instanceof User && ! $user->canOpenSession()) {
            return false;
        }

        // Inactivité : le jeton hérité (sans borne propre) prend celle de tout compte.
        $idle = (int) ($token->idle_timeout_minutes ?? config('auth.sessions.idle_minutes'));
        $lastSeen = Carbon::parse($token->last_used_at ?? $token->created_at);

        return $idle <= 0 || $lastSeen->copy()->addMinutes($idle)->isFuture();
    }
}

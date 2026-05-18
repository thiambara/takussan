<?php

namespace App\Observers;

use App\Models\Profiles\PlatformProfile;

/**
 * TCK-278 — quand un PlatformProfile passe en révoqué (revoked_at set), on
 * détruit tous les tokens Sanctum du user pour invalider les sessions actives.
 *
 * Cf. spec models-spec.md §51 « Règles métier — Révocation = … +
 * tokens()->delete() ».
 */
class PlatformProfileObserver
{
    public function updated(PlatformProfile $profile): void
    {
        if (! $profile->wasChanged('revoked_at')) {
            return;
        }

        if ($profile->revoked_at === null) {
            return;
        }

        $user = $profile->user;
        if ($user !== null && method_exists($user, 'tokens')) {
            $user->tokens()->delete();
        }
    }
}

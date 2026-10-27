<?php

namespace App\Services\Ai;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Enums\PlatformAbility;
use App\Models\User;

/**
 * TCK-2383 (ADR-0076 §9) — l'appelant détient-il ce que l'usage exige ? Un geste plateforme se
 * juge sur le profil plateforme ; une capacité, pour le couple (utilisateur, agence).
 */
final class AiAuthority
{
    public function allows(?User $actor, Capability|PlatformAbility $authority, ?int $agencyId): bool
    {
        if ($actor === null) {
            return false;
        }
        if ($authority instanceof PlatformAbility) {
            return $actor->hasPlatformAbility($authority);
        }

        // Une capacité se juge pour un couple (utilisateur, agence) : sans agence, il n'y a pas de
        // couple, et la décision ne se laisse pas au résolveur (un profil plateforme court-circuite
        // l'agence). Une agence introuvable est refusée de même.
        $agency = $agencyId !== null ? Agency::query()->find($agencyId) : null;
        if ($agency === null) {
            return false;
        }

        return $actor->canActAt($authority, $agency);
    }
}

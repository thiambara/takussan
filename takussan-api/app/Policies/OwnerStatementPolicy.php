<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;

/**
 * TCK-594 (ADR-0039 §3) — qui lit le relevé de gérance d'un bailleur dans une agence.
 *
 * Le bailleur lit le sien, dans une agence où il est bailleur. Un membre du PERSONNEL de cette
 * agence qui détient `payouts.create` lit ceux de ses bailleurs. Un autre bailleur de la même
 * agence, non : l'agence n'est pas un périmètre pour qui n'en est pas le personnel (ADR-0031).
 *
 * Liée par `Gate::define('viewOwnerStatement', …)` : le relevé n'est pas un modèle.
 */
class OwnerStatementPolicy
{
    public function view(User $user, User $landlord, Agency $agency): bool
    {
        if (! $landlord->hasProfileAt((int) $agency->id, OwnerProfile::class)) {
            return false;
        }

        if ($user->id === $landlord->id) {
            return true;
        }

        return $user->staffAgencyId() === (int) $agency->id
            && $user->canActAt(Capability::PayoutsCreate, $agency);
    }
}

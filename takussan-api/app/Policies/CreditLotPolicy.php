<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\User;

/** TCK-633 lot F (ADR-0061 §1) — lire le portefeuille d'un espace : qui peut y dépenser. */
class CreditLotPolicy
{
    public function viewAny(User $user, Agency $agency): bool
    {
        return $user->canActAt(Capability::BoostSpend, $agency);
    }
}

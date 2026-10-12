<?php

namespace App\Policies;

use App\Models\Enums\Capability;
use App\Models\Property;
use App\Models\User;

/** TCK-633 lot F (ADR-0061 §5) — booster un bien : le gérer ET pouvoir dépenser les crédits de son espace. */
class PropertyBoostPolicy
{
    public function viewAny(User $user, Property $property): bool
    {
        return $user->can('view', $property);
    }

    public function create(User $user, Property $property): bool
    {
        return $property->agency !== null
            && $user->can('update', $property)
            && $user->canActAt(Capability::BoostSpend, $property->agency);
    }
}

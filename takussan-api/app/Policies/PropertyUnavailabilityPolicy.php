<?php

namespace App\Policies;

use App\Models\PropertyUnavailability;
use App\Models\User;

/**
 * TCK-596 §3B (ADR-0041 §8) — qui peut modifier le bien gère ses dates bloquées : la règle est
 * celle de `PropertyPolicy::update` (territoire de TCK-587), lue et non recopiée.
 */
class PropertyUnavailabilityPolicy
{
    public function delete(User $user, PropertyUnavailability $unavailability): bool
    {
        $property = $unavailability->property;

        return $property !== null && $user->can('update', $property);
    }
}

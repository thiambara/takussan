<?php

namespace App\Policies;

use App\Models\Property;
use App\Models\User;

/**
 * TCK-098 — Only agency_admin or super_admin within the property's agency
 * may approve or reject. The super_admin bypass is handled globally via
 * Gate::before and does not need to be repeated here.
 */
class PropertyModerationPolicy
{
    public function approve(User $user, Property $property): bool
    {
        return $this->canModerate($user, $property);
    }

    public function reject(User $user, Property $property): bool
    {
        return $this->canModerate($user, $property);
    }

    public function resubmit(User $user, Property $property): bool
    {
        // The property owner or any member of the same agency can resubmit.
        if ($user->id === $property->user_id) {
            return true;
        }

        return $property->agency_id !== null
            && ($user->isAgentAt($property->agency_id) || $user->isOwnerAt($property->agency_id));
    }

    private function canModerate(User $user, Property $property): bool
    {
        if (! ($user->isSuperAdmin() || $user->hasRole('agency_admin'))) {
            return false;
        }

        // An agency_admin can only moderate properties of their own agency.
        if (! $user->isSuperAdmin()) {
            return $property->agency_id !== null
                && ($user->isAgentAt($property->agency_id) || $user->isOwnerAt($property->agency_id));
        }

        return true;
    }
}

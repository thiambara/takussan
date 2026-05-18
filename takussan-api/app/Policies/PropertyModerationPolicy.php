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
        // The property owner or any member of the actor's *currently active*
        // agency context can resubmit. Strict active-profile match — see
        // canModerate() rationale below.
        if ($user->id === $property->user_id) {
            return true;
        }

        return $user->agency_id !== null && $user->agency_id === $property->agency_id;
    }

    private function canModerate(User $user, Property $property): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        // TCK-278 — agency_admin scoped to the property's agency only.
        // The active-profile-aware `$user->agency_id` accessor enforces
        // that the admin is currently acting under the right agency.
        if ($user->agency_id === null || $user->agency_id !== $property->agency_id) {
            return false;
        }

        return $user->isAgencyAdminAt((int) $user->agency_id);
    }
}

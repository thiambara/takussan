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
        if (! ($user->isSuperAdmin() || $user->hasRole('agency_admin'))) {
            return false;
        }

        // An agency_admin can only moderate properties of the agency they
        // are *currently* acting under. The earlier `isAgentAt || isOwnerAt`
        // form combined with the active-team-scoped `hasRole` let an admin
        // at agency Y moderate properties at X just by being a member of X.
        // The active-profile-aware accessor closes the loop: equality with
        // `$property->agency_id` only succeeds when both the role *and* the
        // active context line up on the same agency.
        if (! $user->isSuperAdmin()) {
            return $user->agency_id !== null && $user->agency_id === $property->agency_id;
        }

        return true;
    }
}

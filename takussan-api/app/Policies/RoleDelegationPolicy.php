<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\RoleDelegation;
use App\Models\User;

class RoleDelegationPolicy
{
    /**
     * Determine if the user can view any delegations in an agency.
     * Must be a member of the agency AND (primary_admin OR agency_admin).
     */
    public function viewAny(User $user, Agency $agency): bool
    {
        if ($user->agency_id !== $agency->id) {
            return false;
        }

        return $agency->primary_admin_id === $user->id
            || $user->hasRole('agency_admin');
    }

    /**
     * Determine if the user can view a specific delegation.
     * Admin can view all; beneficiary can view their own.
     */
    public function view(User $user, RoleDelegation $delegation): bool
    {
        if ($this->viewAny($user, $delegation->agency)) {
            return true;
        }

        return $user->id === $delegation->user_id;
    }

    /**
     * Determine if the user can create a delegation in an agency.
     * Same rules as viewAny.
     */
    public function create(User $user, Agency $agency): bool
    {
        return $this->viewAny($user, $agency);
    }

    /**
     * Determine if the user can revoke a delegation.
     * Same rules as viewAny (admin only).
     */
    public function revoke(User $user, RoleDelegation $delegation): bool
    {
        return $this->viewAny($user, $delegation->agency);
    }
}

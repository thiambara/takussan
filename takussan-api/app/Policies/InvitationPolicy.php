<?php

namespace App\Policies;

use App\Models\Invitation;
use App\Models\User;

/**
 * TCK-249 — authorisation rules for the invitation surface.
 *
 * The `super_admin` bypass is wired globally via `Gate::before`, so
 * super-admin actors short-circuit every method below.
 *
 * For everyone else, capability is derived from the role of the actor's
 * active profile:
 *  - agency_admin / admin: can invite + revoke + list within their own
 *    agency.
 *  - owner / agent: cannot create invitations themselves (owners may invite
 *    in TCK-256 but only via the per-role wizard which calls the service
 *    directly, not via this generic endpoint).
 *  - everyone else: read-only on invitations they themselves emitted, no
 *    create / revoke / list scope.
 */
class InvitationPolicy
{
    public function viewAny(User $user): bool
    {
        // Listing requires either super_admin (handled by Gate::before)
        // or an agency-side role. The controller further narrows the
        // result set by `agency_id` for non-super actors.
        return $user->hasRole('agency_admin');
    }

    public function view(User $user, Invitation $invitation): bool
    {
        if ($user->hasRole('agency_admin')) {
            return $invitation->agency_id === null
                || $invitation->agency_id === $user->agency_id;
        }

        // Non-admin actors can only see invitations they emitted (so the
        // per-role wizard can show "your pending invites" in the UI).
        return $invitation->invited_by === $user->id;
    }

    public function create(User $user): bool
    {
        // Generic endpoint: only agency-side admin roles can call it.
        // Per-role wizards (TCK-256/258/260) bypass this policy by
        // talking to InvitationService directly with their own,
        // role-aware authorisation.
        return $user->hasRole('agency_admin');
    }

    public function revoke(User $user, Invitation $invitation): bool
    {
        if ($invitation->invited_by === $user->id) {
            return true;
        }

        return $user->hasRole('agency_admin')
            && $invitation->agency_id === $user->agency_id;
    }

    public function resend(User $user, Invitation $invitation): bool
    {
        return $this->revoke($user, $invitation);
    }
}

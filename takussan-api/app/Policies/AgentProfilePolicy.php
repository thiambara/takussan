<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Profiles\AgentProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Providers\AppServiceProvider;

/**
 * TCK-258 — gates the team-management surface (page `/app/team`).
 *
 * super_admin bypasses every method via the global `Gate::before` hook
 * registered in {@see AppServiceProvider}.
 *
 * Other agency-side actors must:
 *  - belong to a `standard` agency (TCK-248); `individual` agencies
 *    don't manage a team.
 *  - hold an `AgencyAdminProfile` actif sur l'agence, OU bénéficier d'une
 *    `RoleDelegation` active pour le rôle `agency_admin` sur cette agence
 *    (TCK-108).
 */
class AgentProfilePolicy
{
    public function viewAny(User $user, ?Agency $agency = null): bool
    {
        if ($agency !== null) {
            return $this->canManageTeamIn($user, $agency);
        }

        $agencyId = $user->agency_id;
        if ($agencyId === null) {
            return false;
        }

        return $user->isAgencyAdminAt((int) $agencyId) || $user->isAgentAt((int) $agencyId);
    }

    /**
     * `invite` is intentionally agency-scoped (the controller passes the
     * Agency in via `$user->can('invite', [AgentProfile::class, $agency])`).
     */
    public function invite(User $user, Agency $agency): bool
    {
        return $this->canManageTeamIn($user, $agency);
    }

    public function suspend(User $user, AgentProfile $profile): bool
    {
        $agency = $profile->agency;

        return $agency !== null && $this->canManageTeamIn($user, $agency);
    }

    public function delete(User $user, AgentProfile $profile): bool
    {
        $agency = $profile->agency;

        return $agency !== null && $this->canManageTeamIn($user, $agency);
    }

    /**
     * TCK-278 — Profile-based check (no more spatie `setPermissionsTeamId` +
     * `hasPermissionTo`). Membership comes from `AgencyAdminProfile` actif
     * OR an active `RoleDelegation` granting `agency_admin` on the agency
     * (TCK-108).
     */
    protected function canManageTeamIn(User $user, Agency $agency): bool
    {
        $kind = $agency->kind instanceof AgencyKind
            ? $agency->kind
            : AgencyKind::tryFrom((string) $agency->kind);

        if ($kind !== AgencyKind::Standard) {
            return false;
        }

        if ($user->isAgencyAdminAt((int) $agency->id)) {
            return true;
        }

        return $user->hasActiveAgencyDelegation((int) $agency->id, 'agency_admin');
    }
}

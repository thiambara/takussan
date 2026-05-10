<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Profiles\AgentProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Providers\AppServiceProvider;
use App\Services\Invitation\AgentInvitationService;
use Spatie\Permission\PermissionRegistrar;

/**
 * TCK-258 — gates the team-management surface (page `/app/team`).
 *
 * super_admin bypasses every method via the global `Gate::before` hook
 * registered in {@see AppServiceProvider}.
 *
 * Other agency-side actors must:
 *  - belong to a `standard` agency (TCK-248); `individual` agencies
 *    don't manage a team.
 *  - hold the `manage_team` permission *under that agency's team
 *    context* (default-granted to `agency_admin`, optionally to a senior
 *    agent via {@see RoleDelegation}).
 */
class AgentProfilePolicy
{
    public function viewAny(User $user, ?Agency $agency = null): bool
    {
        if ($agency !== null) {
            return $this->canManageTeamIn($user, $agency);
        }

        return $user->hasAnyRole(['admin', 'agency_admin', 'agent']);
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

    protected function canManageTeamIn(User $user, Agency $agency): bool
    {
        $kind = $agency->kind instanceof AgencyKind
            ? $agency->kind
            : AgencyKind::tryFrom((string) $agency->kind);

        if ($kind !== AgencyKind::Standard) {
            return false;
        }

        $registrar = app(PermissionRegistrar::class);
        $previous = $registrar->getPermissionsTeamId();
        $registrar->setPermissionsTeamId($agency->id);

        try {
            $user->unsetRelation('roles');
            $user->unsetRelation('permissions');
            $allowed = $user->hasPermissionTo(AgentInvitationService::PERMISSION, 'web');
        } catch (\Throwable) {
            $allowed = false;
        } finally {
            $registrar->setPermissionsTeamId($previous);
            $user->unsetRelation('roles');
            $user->unsetRelation('permissions');
        }

        return $allowed;
    }
}

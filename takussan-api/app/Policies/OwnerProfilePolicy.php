<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Profiles\OwnerProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Providers\AppServiceProvider;
use App\Services\Invitation\OwnerInvitationService;
use Spatie\Permission\PermissionRegistrar;

/**
 * TCK-256 — gates the owner invitation surface.
 *
 * super_admin bypasses every method via the global `Gate::before` hook
 * registered in {@see AppServiceProvider}.
 *
 * Other agency-side actors must:
 *  - belong to a `standard` agency (TCK-248); `individual` agencies
 *    don't have a portfolio of distinct owners.
 *  - hold the `invite_owner` permission *under that agency's team
 *    context* (default-granted to `agency_admin`, optionally to `agent`
 *    via {@see RoleDelegation}).
 */
class OwnerProfilePolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasAnyRole(['admin', 'agency_admin', 'agent']);
    }

    public function view(User $user, OwnerProfile $profile): bool
    {
        if ($user->hasAnyRole(['admin', 'agency_admin', 'agent'])) {
            return $profile->agency_id === $user->agency_id;
        }

        return $profile->user_id === $user->id;
    }

    /**
     * `invite` is intentionally agency-scoped (the controller passes the
     * Agency in via `$user->can('invite', [OwnerProfile::class, $agency])`).
     */
    public function invite(User $user, Agency $agency): bool
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
            $allowed = $user->hasPermissionTo(OwnerInvitationService::PERMISSION, 'web');
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

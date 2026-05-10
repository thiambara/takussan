<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Enums\AgencyKind;
use App\Models\User;
use App\Providers\AppServiceProvider;
use Spatie\Permission\PermissionRegistrar;

/**
 * TCK-267 — gates the agency upgrade-request surface.
 *
 * super_admin bypasses every method via the global `Gate::before` hook
 * registered in {@see AppServiceProvider}.
 *
 * Other actors must:
 *  - belong to an `individual` agency (only kind that can upgrade), AND
 *  - hold the `agency_admin` role *under that agency's team_id*.
 *
 * Bound explicitly in `AppServiceProvider::boot()` because some abilities
 * take an Agency (not the model itself) as their second argument.
 */
class AgencyUpgradeRequestPolicy
{
    public function viewAny(User $user, Agency $agency): bool
    {
        return $this->isAgencyAdminOfAgency($user, $agency);
    }

    public function view(User $user, AgencyUpgradeRequest $request): bool
    {
        $agency = $request->agency;
        if ($agency === null) {
            return false;
        }

        return $this->isAgencyAdminOfAgency($user, $agency);
    }

    /**
     * `create` is intentionally agency-scoped — the controller passes the
     * Agency in via `$user->can('create', [AgencyUpgradeRequest::class, $agency])`.
     */
    public function create(User $user, Agency $agency): bool
    {
        $kind = $agency->kind instanceof AgencyKind
            ? $agency->kind
            : AgencyKind::tryFrom((string) $agency->kind);

        if ($kind !== AgencyKind::Individual) {
            return false;
        }

        return $this->isAgencyAdminOfAgency($user, $agency);
    }

    /**
     * Either the original submitter or any agency_admin of the same
     * agency may revoke a pending request. The not-pending check is
     * enforced inside the service so the 422 surfaces with a clear
     * message rather than a generic 403.
     */
    public function revoke(User $user, AgencyUpgradeRequest $request): bool
    {
        if ((int) $request->submitted_by === (int) $user->id) {
            return true;
        }

        $agency = $request->agency;
        if ($agency === null) {
            return false;
        }

        return $this->isAgencyAdminOfAgency($user, $agency);
    }

    protected function isAgencyAdminOfAgency(User $user, Agency $agency): bool
    {
        $registrar = app(PermissionRegistrar::class);
        $previous = $registrar->getPermissionsTeamId();
        $registrar->setPermissionsTeamId($agency->id);

        try {
            $user->unsetRelation('roles');
            $user->unsetRelation('permissions');

            return $user->hasRole('agency_admin');
        } catch (\Throwable) {
            return false;
        } finally {
            $registrar->setPermissionsTeamId($previous);
            $user->unsetRelation('roles');
            $user->unsetRelation('permissions');
        }
    }
}

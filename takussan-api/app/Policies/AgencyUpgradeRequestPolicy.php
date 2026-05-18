<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Enums\AgencyKind;
use App\Models\User;
use App\Providers\AppServiceProvider;

/**
 * TCK-267 — gates the agency upgrade-request surface.
 *
 * super_admin bypasses every method via the global `Gate::before` hook
 * registered in {@see AppServiceProvider}.
 *
 * Other actors must:
 *  - belong to an `individual` agency (only kind that can upgrade), AND
 *  - hold an active `AgencyAdminProfile` in that agency.
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
     * TCK-268 — only super-admins may approve. The route group already
     * gates on the `super-admin` middleware; this method exists so
     * `$user->can('approve', $request)` reflects the intent in any
     * non-HTTP caller (CLI, queue jobs).
     */
    public function approve(User $user, AgencyUpgradeRequest $request): bool
    {
        return $user->isSuperAdmin();
    }

    /**
     * TCK-268 — symmetrical with {@see approve()}.
     */
    public function reject(User $user, AgencyUpgradeRequest $request): bool
    {
        return $user->isSuperAdmin();
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

    /**
     * TCK-278 — Profile-based check (no more spatie `setPermissionsTeamId` +
     * `hasRole`). An `AgencyAdminProfile` actif sur l'agence cible suffit.
     */
    protected function isAgencyAdminOfAgency(User $user, Agency $agency): bool
    {
        return $user->isAgencyAdminAt((int) $agency->id);
    }
}

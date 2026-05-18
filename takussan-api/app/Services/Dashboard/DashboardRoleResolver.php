<?php

namespace App\Services\Dashboard;

use App\Contracts\DashboardMetrics;
use App\Models\Customer;
use App\Models\Property;
use App\Models\User;
use App\Services\Dashboard\Adapters\AgencyMeMetrics;
use App\Services\Dashboard\Adapters\AgentMeMetrics;
use App\Services\Dashboard\Adapters\OwnerMeMetrics;
use App\Services\Dashboard\Adapters\TenantMeMetrics;

/**
 * Picks the right DashboardMetrics adapter for GET /api/dashboard/me.
 *
 * Priority (per TCK-032 contract):
 *   1. super_admin with agency_id        → agency view
 *   2. agency_admin / admin with agency  → agency view
 *   3. agent with agency                 → agent view
 *   4. owner role OR owns properties     → owner view
 *   5. customer role OR linked Customer  → tenant view
 *   6. otherwise                         → null  (controller returns 404)
 *
 * super_admin without agency_id falls through and may resolve to owner /
 * tenant views if applicable, otherwise returns null. The frontend
 * displays NoAgencyState when role === 'super_admin' && !agency_id.
 */
class DashboardRoleResolver
{
    public function __construct(
        private readonly AgencyMeMetrics $agency,
        private readonly AgentMeMetrics $agent,
        private readonly OwnerMeMetrics $owner,
        private readonly TenantMeMetrics $tenant,
    ) {}

    public function resolve(User $user): ?DashboardMetrics
    {
        $agencyId = $user->agency_id;

        if ($agencyId !== null
            && ($user->isSuperAdmin() || $user->isAgencyAdminAt((int) $agencyId))) {
            return $this->agency;
        }

        if ($agencyId !== null && $user->isAgentAt((int) $agencyId)) {
            return $this->agent;
        }

        if (($agencyId !== null && $user->isOwnerAt((int) $agencyId))
            || Property::where('user_id', $user->id)->exists()) {
            return $this->owner;
        }

        // TCK-278 — `customer` reste un rôle dérivé (cf. Règle 5) : on
        // s'appuie uniquement sur la table Customer (la profile-isation
        // est reportée à un ticket ultérieur si TCK-020/090 en font émerger
        // le besoin).
        if (Customer::where('user_id', $user->id)->exists()) {
            return $this->tenant;
        }

        return null;
    }
}

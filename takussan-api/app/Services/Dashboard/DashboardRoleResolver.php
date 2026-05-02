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
        if ($user->hasRole(['super_admin', 'agency_admin', 'admin']) && $user->agency_id) {
            return $this->agency;
        }

        if ($user->hasRole('agent') && $user->agency_id) {
            return $this->agent;
        }

        if ($user->hasRole('owner') || Property::where('user_id', $user->id)->exists()) {
            return $this->owner;
        }

        if ($user->hasRole('customer') || Customer::where('user_id', $user->id)->exists()) {
            return $this->tenant;
        }

        return null;
    }
}

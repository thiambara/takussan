<?php

namespace App\Services\Billing;

use App\Models\Agency;
use App\Models\AgencySubscription;
use App\Models\Enums\PropertyStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use Symfony\Component\HttpKernel\Exception\HttpException;

class QuotaResolver
{
    public function currentSubscription(Agency|int|null $agency): ?AgencySubscription
    {
        $agencyId = $agency instanceof Agency ? $agency->id : $agency;
        if (! $agencyId) {
            return null;
        }

        return AgencySubscription::query()
            ->with('plan')
            ->where('agency_id', $agencyId)
            ->whereNull('ended_at')
            ->first();
    }

    public function effectivePlatformFeePct(AgencySubscription $subscription): float
    {
        return (float) ($subscription->platform_fee_pct_override ?? $subscription->plan?->platform_fee_pct ?? 0);
    }

    public function effectiveLimits(AgencySubscription $subscription): array
    {
        $planLimits = $subscription->plan?->limits ?? [];
        $overrides = $subscription->limits_override ?? [];

        return array_replace($planLimits, $overrides);
    }

    public function effectiveLimitsForAgency(Agency|int|null $agency): array
    {
        $subscription = $this->currentSubscription($agency);

        return $subscription ? $this->effectiveLimits($subscription) : [];
    }

    public function assertCanCreateActiveListing(Agency|int|null $agency): void
    {
        $subscription = $this->currentSubscription($agency);
        if (! $subscription) {
            return;
        }

        $limit = $this->effectiveLimits($subscription)['max_active_listings'] ?? null;
        if ($limit === null) {
            return;
        }

        $count = Property::query()
            ->where('agency_id', $subscription->agency_id)
            ->whereIn('status', [
                PropertyStatus::Available,
                PropertyStatus::Published,
                PropertyStatus::Pending,
                PropertyStatus::PendingReview,
            ])
            ->count();

        if ($count >= (int) $limit) {
            throw new HttpException(422, 'Active listing quota exceeded for this agency plan.');
        }
    }

    public function assertCanAddAgent(Agency $agency): void
    {
        $subscription = $this->currentSubscription($agency);
        if (! $subscription) {
            return;
        }

        $limit = $this->effectiveLimits($subscription)['max_agents'] ?? null;
        if ($limit === null) {
            return;
        }

        $count = AgentProfile::query()
            ->where('agency_id', $agency->id)
            ->count();

        if ($count >= (int) $limit) {
            throw new HttpException(422, 'Agent quota exceeded for this agency plan.');
        }
    }
}

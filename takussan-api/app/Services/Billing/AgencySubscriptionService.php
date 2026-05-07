<?php

namespace App\Services\Billing;

use App\Models\Agency;
use App\Models\AgencySubscription;
use App\Models\Enums\AgencySubscriptionStatus;
use App\Models\Plan;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class AgencySubscriptionService
{
    public function assign(Agency $agency, Plan $plan, User $actor, array $data = []): AgencySubscription
    {
        return DB::transaction(function () use ($agency, $plan, $actor, $data): AgencySubscription {
            AgencySubscription::query()
                ->where('agency_id', $agency->id)
                ->whereNull('ended_at')
                ->lockForUpdate()
                ->get()
                ->each(function (AgencySubscription $subscription): void {
                    $subscription->update([
                        'status' => AgencySubscriptionStatus::Ended,
                        'ended_at' => now(),
                    ]);
                });

            $trialEndsAt = isset($data['trial_ends_at']) ? Carbon::parse($data['trial_ends_at']) : null;
            $status = $trialEndsAt?->isFuture()
                ? AgencySubscriptionStatus::Trialing
                : AgencySubscriptionStatus::Active;

            $subscription = AgencySubscription::query()->create([
                'agency_id' => $agency->id,
                'plan_id' => $plan->id,
                'status' => $status,
                'trial_ends_at' => $trialEndsAt,
                'current_period_start' => now(),
                'current_period_end' => now()->addMonth(),
                'platform_fee_pct_override' => data_get($data, 'overrides.platform_fee_pct'),
                'limits_override' => data_get($data, 'overrides.limits'),
            ]);

            activity('Billing')
                ->causedBy($actor)
                ->performedOn($subscription)
                ->event('super_admin_subscription_assigned')
                ->withProperties(['agency_id' => $agency->id, 'plan_id' => $plan->id])
                ->log('Agency subscription assigned');

            return $subscription->load('plan');
        });
    }

    public function cancel(Agency $agency, User $actor): ?AgencySubscription
    {
        return DB::transaction(function () use ($agency, $actor): ?AgencySubscription {
            $subscription = AgencySubscription::query()
                ->where('agency_id', $agency->id)
                ->whereNull('ended_at')
                ->lockForUpdate()
                ->first();

            if (! $subscription) {
                return null;
            }

            $subscription->update([
                'status' => AgencySubscriptionStatus::Ended,
                'ended_at' => now(),
            ]);

            activity('Billing')
                ->causedBy($actor)
                ->performedOn($subscription)
                ->event('super_admin_subscription_cancelled')
                ->withProperties(['agency_id' => $agency->id])
                ->log('Agency subscription cancelled');

            return $subscription->refresh()->load('plan');
        });
    }

    public function processTrialExpirations(): int
    {
        $count = 0;

        AgencySubscription::query()
            ->where('status', AgencySubscriptionStatus::Trialing)
            ->whereNull('ended_at')
            ->whereNotNull('trial_ends_at')
            ->where('trial_ends_at', '<=', now())
            ->chunkById(100, function ($subscriptions) use (&$count): void {
                foreach ($subscriptions as $subscription) {
                    $subscription->update(['status' => AgencySubscriptionStatus::Active]);
                    $count++;
                }
            });

        return $count;
    }
}

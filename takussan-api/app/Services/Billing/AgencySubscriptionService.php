<?php

namespace App\Services\Billing;

use App\Models\Agency;
use App\Models\AgencySubscription;
use App\Models\Enums\AgencyStatus;
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

    /**
     * TCK-2222 (P214.01, décision du porteur du 2026-10-24) — modifie sur place les dérogations de
     * l'abonnement ouvert, sans le clore : statut, essai et période restent ceux de la ligne.
     * `assign()` reste le changement de plan, qui clôt et ouvre une ligne neuve.
     *
     * `platform_fee_pct` présent remplace la commission dérogée (`null` la retire) ; `limits` se
     * fusionne clé par clé sur les quotas dérogés, une clé à `null` retirée (« merge », spec 44).
     * Rend `null` sans abonnement ouvert.
     *
     * @param  array{platform_fee_pct?: float|int|string|null, limits?: array<string, int|null>}  $data
     */
    public function updateOverrides(Agency $agency, User $actor, array $data): ?AgencySubscription
    {
        return DB::transaction(function () use ($agency, $actor, $data): ?AgencySubscription {
            $subscription = AgencySubscription::query()
                ->where('agency_id', $agency->id)
                ->whereNull('ended_at')
                ->lockForUpdate()
                ->first();

            if (! $subscription) {
                return null;
            }

            $before = [
                'platform_fee_pct' => $subscription->platform_fee_pct_override,
                'limits' => $subscription->limits_override,
            ];

            if (array_key_exists('platform_fee_pct', $data)) {
                $subscription->platform_fee_pct_override = $data['platform_fee_pct'];
            }

            if (array_key_exists('limits', $data)) {
                $limits = array_filter(
                    array_replace($subscription->limits_override ?? [], $data['limits']),
                    static fn ($value): bool => $value !== null,
                );
                $subscription->limits_override = $limits === [] ? null : $limits;
            }

            $subscription->save();

            activity('Billing')
                ->causedBy($actor)
                ->performedOn($subscription)
                ->event('super_admin_subscription_overrides_updated')
                ->withProperties([
                    'agency_id' => $agency->id,
                    'before' => $before,
                    'after' => [
                        'platform_fee_pct' => $subscription->platform_fee_pct_override,
                        'limits' => $subscription->limits_override,
                    ],
                ])
                ->log('Agency subscription overrides updated');

            return $subscription->refresh()->load('plan');
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

    /**
     * TCK-1303 (P115.03, décision du porteur) — la période d'un abonnement `active` se reconduit
     * mois par mois tant qu'il le reste : sans cela, elle n'était écrite qu'à l'attribution, et
     * l'écran de facturation affichait un mois après une période échue comme période en cours.
     *
     * Une période échue depuis plusieurs mois (tâche arrêtée, abonnement ancien) est rattrapée
     * jusqu'à celle qui contient maintenant. Le mois ne déborde pas (`addMonthNoOverflow`) : une
     * période du 31 août finit le 30 septembre, pas le 1er octobre. Idempotente : seules les
     * périodes échues sont relues, chacune sous son verrou. Rend le nombre d'abonnements reconduits.
     */
    public function renewPeriods(): int
    {
        $ids = AgencySubscription::query()
            ->where('status', AgencySubscriptionStatus::Active)
            ->whereNull('ended_at')
            ->whereNotNull('current_period_end')
            ->where('current_period_end', '<=', now())
            ->pluck('id');

        $count = 0;
        foreach ($ids as $id) {
            $renewed = DB::transaction(function () use ($id): bool {
                $subscription = AgencySubscription::query()->whereKey($id)->lockForUpdate()->first();
                if (! $subscription
                    || $subscription->status !== AgencySubscriptionStatus::Active
                    || $subscription->ended_at !== null
                    || $subscription->current_period_end === null
                    || $subscription->current_period_end->isFuture()) {
                    return false;
                }

                $start = $subscription->current_period_end->copy();
                $end = $start->copy()->addMonthNoOverflow();
                while ($end->lessThanOrEqualTo(now())) {
                    $start = $end;
                    $end = $start->copy()->addMonthNoOverflow();
                }

                $subscription->update(['current_period_start' => $start, 'current_period_end' => $end]);

                return true;
            });

            $count += $renewed ? 1 : 0;
        }

        return $count;
    }

    public function processTrialExpirations(): int
    {
        // Snapshot the IDs first: chunkById while mutating the `status` filter
        // column is a known footgun that skips rows as the result set shifts.
        // Updating by frozen ID set (and re-checking state) avoids that while
        // preserving per-model update events.
        $ids = AgencySubscription::query()
            ->where('status', AgencySubscriptionStatus::Trialing)
            ->whereNull('ended_at')
            ->whereNotNull('trial_ends_at')
            ->where('trial_ends_at', '<=', now())
            // TCK-1501 (P129.05, ADR-0048 amendé le 2026-10-22) — une agence `inactive` ou
            // `suspended` ne commence pas à être facturée : son essai échu attend son retour à
            // `active`, et se convertit au premier passage qui suit.
            ->whereHas('agency', fn ($q) => $q->where('status', AgencyStatus::Active))
            ->pluck('id');

        // TCK-2310 (P229.06) — sur le patron de `renewPeriods` : chaque essai se relit sous verrou, et
        // tous les critères de la sélection s'y rejugent, statut de l'agence compris. Une annulation,
        // une prolongation ou une suspension écrite depuis la sélection ne convertit plus l'essai.
        $count = 0;
        foreach ($ids as $id) {
            $converted = DB::transaction(function () use ($id): bool {
                $subscription = AgencySubscription::query()->whereKey($id)->lockForUpdate()->first();
                if (! $subscription
                    || $subscription->status !== AgencySubscriptionStatus::Trialing
                    || $subscription->ended_at !== null
                    || $subscription->trial_ends_at === null
                    || $subscription->trial_ends_at->isFuture()
                    || Agency::query()->whereKey($subscription->agency_id)->value('status') !== AgencyStatus::Active) {
                    return false;
                }

                $subscription->update(['status' => AgencySubscriptionStatus::Active]);

                return true;
            });

            $count += $converted ? 1 : 0;
        }

        return $count;
    }
}

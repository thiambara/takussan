<?php

namespace Tests\Support;

use App\Models\Plan;

/**
 * TCK-2681 (ADR-0104 § 6) — l'approbation d'un passage en pro abonne l'agence au plan
 * `billing.upgrade_plan_code`, et ÉCHOUE sans lui (422 `agency_upgrade.plan_unavailable`). Les
 * tests qui approuvent sans parler de l'abonnement s'en servent : le plan existe, actif, comme
 * dans les environnements semés par `PlanSeeder`. Ceux qui éprouvent la règle
 * (`AgencyUpgradeApprovalSubscriptionTest`) posent leur propre plan.
 *
 * `setUpPlanDuPassage()` est appelée par `setUpTraits()` du framework, après `RefreshDatabase`.
 */
trait PlanDuPassage
{
    protected function setUpPlanDuPassage(): void
    {
        Plan::query()->firstOrCreate(
            ['code' => (string) config('billing.upgrade_plan_code')],
            [
                'label' => 'Pro', 'monthly_price_xof' => 50000, 'platform_fee_pct' => 3, 'trial_days' => 0,
                'limits' => ['max_active_listings' => 100, 'max_agents' => 15, 'max_branches' => 3],
                'is_active' => true, 'sort_order' => 20,
            ],
        );
    }
}

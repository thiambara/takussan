<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\AgencySubscription;
use App\Models\Enums\AgencySubscriptionStatus;
use App\Models\Plan;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-2222 (P214.01, décision du porteur du 2026-10-24) — « Modifier les dérogations » est un
 * geste séparé du changement de plan : il modifie sur place l'abonnement ouvert (commission et
 * trois quotas), sans le clore, période et essai gardés. Avant lui, le seul geste était
 * « Assigner », qui clôt l'abonnement et en ouvre un neuf : changer le seul quota de biens
 * effaçait la commission négociée, les autres quotas dérogés et l'essai en cours.
 */
class AgencySubscriptionOverridesTest extends TestCase
{
    use RefreshDatabase;

    public function test_modifier_un_quota_garde_la_commission_les_autres_quotas_l_essai_et_la_periode(): void
    {
        $actor = $this->actingAsRole('super_admin');
        [$agency, $subscription] = $this->abonnementDeroge();
        $periodStart = $subscription->current_period_start->toIso8601String();
        $trialEndsAt = $subscription->trial_ends_at->toIso8601String();

        $this->patchJson("/api/admin/agencies/{$agency->id}/subscription/overrides", [
            'limits' => ['max_active_listings' => 150],
        ])
            ->assertOk()
            ->assertJsonPath('data.id', $subscription->id)
            ->assertJsonPath('data.status', AgencySubscriptionStatus::Trialing->value)
            ->assertJsonPath('data.effective_platform_fee_pct', 1)
            ->assertJsonPath('data.effective_limits.max_agents', 20)
            ->assertJsonPath('data.effective_limits.max_active_listings', 150);

        $subscription->refresh();
        $this->assertNull($subscription->ended_at);
        $this->assertSame(AgencySubscriptionStatus::Trialing, $subscription->status);
        $this->assertSame($trialEndsAt, $subscription->trial_ends_at->toIso8601String());
        $this->assertSame($periodStart, $subscription->current_period_start->toIso8601String());
        $this->assertEquals(1.0, (float) $subscription->platform_fee_pct_override);
        $this->assertEquals(['max_agents' => 20, 'max_active_listings' => 150], $subscription->limits_override);
        $this->assertSame(1, AgencySubscription::query()->where('agency_id', $agency->id)->count());

        $this->assertTrue(Activity::query()
            ->where('event', 'super_admin_subscription_overrides_updated')
            ->where('causer_id', $actor->id)
            ->where('subject_id', $subscription->id)
            ->exists());
    }

    public function test_une_valeur_a_null_retire_la_derogation_et_rend_la_valeur_du_plan(): void
    {
        $this->actingAsRole('super_admin');
        [$agency, $subscription] = $this->abonnementDeroge();

        $this->patchJson("/api/admin/agencies/{$agency->id}/subscription/overrides", [
            'platform_fee_pct' => null,
            'limits' => ['max_agents' => null, 'max_branches' => 4],
        ])
            ->assertOk()
            ->assertJsonPath('data.platform_fee_pct_override', null)
            ->assertJsonPath('data.effective_platform_fee_pct', 3)
            ->assertJsonPath('data.effective_limits.max_agents', 15)
            ->assertJsonPath('data.effective_limits.max_branches', 4);

        $this->assertEquals(['max_branches' => 4], $subscription->refresh()->limits_override);

        $this->patchJson("/api/admin/agencies/{$agency->id}/subscription/overrides", [
            'limits' => ['max_branches' => null],
        ])->assertOk();

        $this->assertNull($subscription->refresh()->limits_override);
    }

    public function test_sans_abonnement_ouvert_rend_404_et_n_ecrit_rien(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create();

        $this->patchJson("/api/admin/agencies/{$agency->id}/subscription/overrides", [
            'platform_fee_pct' => 1,
        ])->assertNotFound();

        $this->assertSame(0, AgencySubscription::query()->count());
    }

    public function test_une_commission_hors_bornes_est_refusee(): void
    {
        $this->actingAsRole('super_admin');
        [$agency, $subscription] = $this->abonnementDeroge();

        $this->patchJson("/api/admin/agencies/{$agency->id}/subscription/overrides", [
            'platform_fee_pct' => 101,
            'limits' => ['max_agents' => -1],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['platform_fee_pct', 'limits.max_agents']);

        $this->patchJson("/api/admin/agencies/{$agency->id}/subscription/overrides", [
            'limits' => ['max_properties_ever' => 3],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['limits']);

        $this->assertEquals(1.0, (float) $subscription->refresh()->platform_fee_pct_override);
        $this->assertEquals(['max_agents' => 20], $subscription->limits_override);
    }

    public function test_un_admin_d_agence_est_refuse(): void
    {
        [$agency, $subscription] = $this->abonnementDeroge();
        $this->actingAsRole('agency_admin', ['agency' => $agency]);

        $this->patchJson("/api/admin/agencies/{$agency->id}/subscription/overrides", [
            'platform_fee_pct' => 0,
        ])->assertForbidden();

        $this->assertEquals(1.0, (float) $subscription->refresh()->platform_fee_pct_override);
    }

    /** @return array{Agency, AgencySubscription} */
    private function abonnementDeroge(): array
    {
        $agency = Agency::factory()->create();
        $plan = Plan::query()->create([
            'code' => 'pro',
            'label' => 'Pro',
            'monthly_price_xof' => 0,
            'platform_fee_pct' => 3,
            'trial_days' => 0,
            'limits' => ['max_agents' => 15, 'max_active_listings' => 50, 'max_branches' => 2],
            'is_active' => true,
            'sort_order' => 10,
        ]);
        $subscription = AgencySubscription::query()->create([
            'agency_id' => $agency->id,
            'plan_id' => $plan->id,
            'status' => AgencySubscriptionStatus::Trialing,
            'trial_ends_at' => now()->addDays(10)->startOfSecond(),
            'current_period_start' => now()->subDays(3)->startOfSecond(),
            'current_period_end' => now()->addDays(27)->startOfSecond(),
            'platform_fee_pct_override' => 1,
            'limits_override' => ['max_agents' => 20],
        ]);

        return [$agency, $subscription];
    }
}

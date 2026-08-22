<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\AgencySubscription;
use App\Models\Enums\AgencySubscriptionStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Plan;
use App\Models\Property;
use App\Services\Billing\AgencySubscriptionService;
use App\Services\Billing\QuotaResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

class BillingPlansTest extends TestCase
{
    use RefreshDatabase;

    public function test_assigning_a_new_plan_closes_previous_open_subscription(): void
    {
        $actor = $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create();
        $free = $this->plan('free');
        $pro = $this->plan('pro');

        $this->postJson("/api/admin/agencies/{$agency->id}/subscription", ['plan_id' => $free->id])
            ->assertCreated()
            ->assertJsonPath('data.plan_id', $free->id);

        $this->postJson("/api/admin/agencies/{$agency->id}/subscription", ['plan_id' => $pro->id])
            ->assertCreated()
            ->assertJsonPath('data.plan_id', $pro->id);

        $this->assertSame(1, AgencySubscription::query()->where('agency_id', $agency->id)->whereNull('ended_at')->count());
        $this->assertDatabaseHas('agency_subscriptions', [
            'agency_id' => $agency->id,
            'plan_id' => $free->id,
            'status' => AgencySubscriptionStatus::Ended->value,
        ]);
        $this->assertTrue(Activity::query()
            ->where('event', 'super_admin_subscription_assigned')
            ->where('causer_id', $actor->id)
            ->exists());
    }

    public function test_quota_resolver_prefers_overrides_over_plan_values(): void
    {
        $agency = Agency::factory()->create();
        $plan = $this->plan('pro', [
            'platform_fee_pct' => 5,
            'limits' => ['max_active_listings' => 10, 'max_agents' => 5],
        ]);
        $subscription = AgencySubscription::query()->create([
            'agency_id' => $agency->id,
            'plan_id' => $plan->id,
            'status' => AgencySubscriptionStatus::Active,
            'current_period_start' => now(),
            'current_period_end' => now()->addMonth(),
            'platform_fee_pct_override' => 2.5,
            'limits_override' => ['max_active_listings' => 3],
        ])->load('plan');

        $resolver = app(QuotaResolver::class);

        $this->assertSame(2.5, $resolver->effectivePlatformFeePct($subscription));

        // ⚠ On trie les clés avant de comparer, et ce n'est PAS un contournement.
        //
        // `assertSame` sur deux tableaux compare aussi l'ORDRE des clés. Ce test
        // passait tant que `plans.limits` était une colonne `json`, qui restitue les
        // clés dans l'ordre d'insertion. Depuis ADR-0020 la colonne est `jsonb`, qui
        // NORMALISE cet ordre (par longueur de clé, puis octet par octet) :
        // `max_agents` remonte donc avant `max_active_listings`.
        //
        // La valeur rendue n'a pas changé — seul son ordre de clés, qui n'a jamais
        // été un contrat : `effectiveLimits()` rend une table d'association, et
        // l'ordre des clés d'un objet JSON n'est porteur d'aucun sens. Le test
        // affirmait donc une propriété du MOTEUR en croyant affirmer une propriété du
        // code.
        //
        // `ksort` plutôt que `assertEqualsCanonicalizing` : ce dernier compare avec
        // `==` et laisserait passer un `'5'` là où on attend `5` — or c'est
        // exactement le genre de glissement de type qu'un changement de driver
        // provoque. On garde la comparaison STRICTE.
        $this->assertSameIgnoringKeyOrder(
            ['max_active_listings' => 3, 'max_agents' => 5],
            $resolver->effectiveLimits($subscription),
        );
    }

    public function test_creating_listing_over_active_quota_returns_422(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency' => $agency]);
        $plan = $this->plan('free', ['limits' => ['max_active_listings' => 1]]);
        AgencySubscription::query()->create([
            'agency_id' => $agency->id,
            'plan_id' => $plan->id,
            'status' => AgencySubscriptionStatus::Active,
            'current_period_start' => now(),
            'current_period_end' => now()->addMonth(),
        ]);
        Property::factory()->create([
            'agency_id' => $agency->id,
            'status' => PropertyStatus::Available,
        ]);

        $this->postJson('/api/properties', $this->propertyPayload())
            ->assertStatus(422)
            ->assertJsonPath('message', 'Active listing quota exceeded for this agency plan.');
    }

    public function test_expired_trial_transitions_to_active(): void
    {
        $agency = Agency::factory()->create();
        $plan = $this->plan('trial');
        $subscription = AgencySubscription::query()->create([
            'agency_id' => $agency->id,
            'plan_id' => $plan->id,
            'status' => AgencySubscriptionStatus::Trialing,
            'trial_ends_at' => now()->subMinute(),
            'current_period_start' => now()->subDays(14),
            'current_period_end' => now()->addDays(16),
        ]);

        $processed = app(AgencySubscriptionService::class)->processTrialExpirations();

        $this->assertSame(1, $processed);
        $this->assertSame(AgencySubscriptionStatus::Active, $subscription->refresh()->status);
    }

    public function test_agency_admin_is_forbidden_on_super_admin_billing_writes(): void
    {
        $agency = Agency::factory()->create();
        $plan = $this->plan('free');
        $this->actingAsRole('agency_admin', ['agency' => $agency]);

        $this->postJson('/api/admin/plans', [
            'code' => 'starter',
            'label' => 'Starter',
            'monthly_price_xof' => 10000,
            'platform_fee_pct' => 2,
        ])->assertForbidden();

        $this->postJson("/api/admin/agencies/{$agency->id}/subscription", [
            'plan_id' => $plan->id,
        ])->assertForbidden();
    }

    public function test_referenced_plan_delete_returns_409_and_plan_mutations_are_audited(): void
    {
        $actor = $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create();

        $planId = $this->postJson('/api/admin/plans', [
            'code' => 'starter',
            'label' => 'Starter',
            'monthly_price_xof' => 10000,
            'platform_fee_pct' => 2,
            'limits' => ['max_active_listings' => 10],
        ])->assertCreated()->json('data.id');

        AgencySubscription::query()->create([
            'agency_id' => $agency->id,
            'plan_id' => $planId,
            'status' => AgencySubscriptionStatus::Active,
            'current_period_start' => now(),
            'current_period_end' => now()->addMonth(),
        ]);

        $this->deleteJson("/api/admin/plans/{$planId}")
            ->assertStatus(409)
            ->assertJsonPath('message', 'Plan is referenced by agency subscriptions.');

        $this->assertTrue(Activity::query()
            ->where('event', 'super_admin_plan_created')
            ->where('causer_id', $actor->id)
            ->exists());
    }

    private function plan(string $code, array $overrides = []): Plan
    {
        return Plan::query()->create(array_merge([
            'code' => $code,
            'label' => ucfirst($code),
            'monthly_price_xof' => 0,
            'platform_fee_pct' => 0,
            'trial_days' => 0,
            'limits' => [],
            'is_active' => true,
            'sort_order' => 10,
        ], $overrides));
    }

    private function propertyPayload(): array
    {
        return [
            'title' => 'Appartement Plateau',
            'type' => PropertyType::Apartment->value,
            'contract_type' => ContractType::Rent->value,
            'status' => PropertyStatus::Available->value,
            'price' => 250000,
        ];
    }
}

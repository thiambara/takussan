<?php

namespace Tests\Feature\Admin;

use App\Models\Agency;
use App\Models\AgencySubscription;
use App\Models\AgencyUpgradeRequest;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencySubscriptionStatus;
use App\Models\Enums\AgencyUpgradeRequestStatus;
use App\Models\Enums\KycDossierStatus;
use App\Models\Invoice;
use App\Models\KycDossier;
use App\Models\Plan;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;

/**
 * TCK-2681 (ADR-0104 § 6) — l'approbation d'un passage en pro abonne l'agence au plan annoncé
 * (`billing.upgrade_plan_code`), dans la même transaction que la bascule : sans plan, rien ne reste.
 */
class AgencyUpgradeApprovalSubscriptionTest extends ApiTestCase
{
    use RefreshDatabase;

    private Plan $pro;

    private Agency $agency;

    private User $admin;

    private AgencyUpgradeRequest $request;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo(Carbon::parse('2026-11-11 10:00:00'));
        $this->pro = Plan::query()->create([
            'code' => 'pro', 'label' => 'Pro', 'monthly_price_xof' => 50000, 'platform_fee_pct' => 3,
            'trial_days' => 0, 'limits' => ['max_agents' => 15], 'is_active' => true, 'sort_order' => 20,
        ]);
        $this->agency = Agency::factory()->individual()->create();
        $this->admin = User::factory()->create();
        $this->materializeRoleProfile($this->admin, 'agency_admin', $this->agency);
        KycDossier::query()->create([
            'subject_type' => Agency::class, 'subject_id' => $this->agency->id,
            'status' => KycDossierStatus::Verified, 'metadata' => [],
        ]);
        $this->request = AgencyUpgradeRequest::factory()->pending()->create([
            'agency_id' => $this->agency->id, 'submitted_by' => $this->admin->id,
        ]);
    }

    private function approve(): TestResponse
    {
        $this->apiActingAsRole('super_admin');

        return $this->apiPost("/api/admin/agency-upgrade-requests/{$this->request->id}/approve", ['comment' => 'Statuts vérifiés.']);
    }

    /** @return Collection<int, AgencySubscription> */
    private function subscriptions()
    {
        return AgencySubscription::query()->where('agency_id', $this->agency->id)->orderBy('id')->get();
    }

    public function test_ac1_l_approbation_abonne_l_agence_au_plan_pro(): void
    {
        $this->approve()->assertOk();

        $subscription = $this->subscriptions()->sole();
        $this->assertSame($this->pro->id, (int) $subscription->plan_id);
        $this->assertSame(AgencySubscriptionStatus::Active, $subscription->status);
        $this->assertNull($subscription->ended_at);
        $this->assertTrue($subscription->current_period_start->equalTo(now()));
        $this->assertTrue($subscription->current_period_end->equalTo(now()->addMonth()));
        $this->assertNull($subscription->trial_ends_at);
        $this->assertNull($subscription->platform_fee_pct_override);
        $this->assertNull($subscription->limits_override);

        // Ce que l'admin de l'agence lit.
        $this->actingAs($this->admin, 'sanctum');
        $this->apiGet('/api/me/subscription')->assertOk()
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.plan.code', 'pro');
        $this->assertEquals(50000, $this->apiGet('/api/me/subscription')->json('data.plan.monthly_price_xof'));
    }

    public function test_le_journal_dit_l_abonnement_pose_par_l_approbation(): void
    {
        $this->approve()->assertOk();

        $log = Activity::query()->where('event', 'agency_upgrade_subscription_assigned')->sole();
        $subscription = $this->subscriptions()->sole();
        $this->assertSame($this->agency->id, (int) $log->properties['agency_id']);
        $this->assertSame($this->pro->id, (int) $log->properties['plan_id']);
        $this->assertSame($this->request->id, (int) $log->properties['agency_upgrade_request_id']);
        $this->assertSame([], $log->properties['replaced_subscription_ids']);
        $this->assertSame(AgencySubscription::class, $log->subject_type);
        $this->assertSame($subscription->id, (int) $log->subject_id);
        // En plus de celui d'`assign`.
        $this->assertSame(1, Activity::query()->where('event', 'super_admin_subscription_assigned')->count());
    }

    public function test_le_plan_est_celui_de_la_configuration(): void
    {
        $business = Plan::query()->create([
            'code' => 'business', 'label' => 'Business', 'monthly_price_xof' => 120000, 'platform_fee_pct' => 2,
            'trial_days' => 0, 'limits' => [], 'is_active' => true, 'sort_order' => 30,
        ]);
        config(['billing.upgrade_plan_code' => 'business']);

        $this->approve()->assertOk();

        $this->assertSame($business->id, (int) $this->subscriptions()->sole()->plan_id);
    }

    public function test_ac2_plan_inactif_rien_ne_reste(): void
    {
        $this->pro->update(['is_active' => false]);

        $this->approve()->assertStatus(422)->assertJsonPath('code', 'agency_upgrade.plan_unavailable');

        $this->assertSame(AgencyUpgradeRequestStatus::Pending, $this->request->fresh()->status);
        $this->assertNull($this->request->fresh()->reviewed_at);
        $this->assertSame(AgencyKind::Individual, $this->agency->fresh()->kind);
        $this->assertCount(0, $this->subscriptions());
        $this->assertSame(0, Activity::query()->where('event', 'agency_upgrade_approved')->count());
        Notification::assertNothingSent();
    }

    public function test_plan_absent_rien_ne_reste(): void
    {
        config(['billing.upgrade_plan_code' => 'inconnu']);

        $this->approve()->assertStatus(422)->assertJsonPath('code', 'agency_upgrade.plan_unavailable');

        $this->assertSame(AgencyUpgradeRequestStatus::Pending, $this->request->fresh()->status);
        $this->assertSame(AgencyKind::Individual, $this->agency->fresh()->kind);
    }

    public function test_un_abonnement_ouvert_est_clos_et_remplace(): void
    {
        $free = Plan::query()->create([
            'code' => 'free', 'label' => 'Free', 'monthly_price_xof' => 0, 'platform_fee_pct' => 0,
            'trial_days' => 14, 'limits' => [], 'is_active' => true, 'sort_order' => 10,
        ]);
        $previous = AgencySubscription::query()->create([
            'agency_id' => $this->agency->id, 'plan_id' => $free->id, 'status' => AgencySubscriptionStatus::Active,
            'current_period_start' => now()->subWeek(), 'current_period_end' => now()->addWeeks(3),
        ]);

        $this->approve()->assertOk();

        $all = $this->subscriptions();
        $this->assertCount(2, $all);
        $this->assertSame(AgencySubscriptionStatus::Ended, $previous->fresh()->status);
        $this->assertNotNull($previous->fresh()->ended_at);
        $open = $all->whereNull('ended_at')->sole();
        $this->assertSame($this->pro->id, (int) $open->plan_id);

        $log = Activity::query()->where('event', 'agency_upgrade_subscription_assigned')->sole();
        $this->assertSame([$previous->id], array_map('intval', $log->properties['replaced_subscription_ids']));
    }

    public function test_le_rejet_ne_touche_a_aucun_abonnement(): void
    {
        $this->apiActingAsRole('super_admin');
        $this->apiPost("/api/admin/agency-upgrade-requests/{$this->request->id}/reject", ['comment' => 'Statuts illisibles.'])->assertOk();

        $this->assertCount(0, $this->subscriptions());
        $this->assertSame(0, Activity::query()->where('event', 'agency_upgrade_subscription_assigned')->count());
    }

    public function test_ac3_aucune_facture_ni_aucun_job_de_paiement(): void
    {
        Queue::fake();
        $invoices = Invoice::query()->count();

        $this->approve()->assertOk();

        $this->assertSame($invoices, Invoice::query()->count());
        $jobs = array_keys(Queue::pushedJobs());
        $this->assertSame([], array_values(array_filter(
            $jobs,
            fn (string $job) => preg_match('/Payment|Invoice|Billing|Subscription|Payout/i', $job) === 1,
        )), 'Jobs poussés : '.implode(', ', $jobs));
    }
}

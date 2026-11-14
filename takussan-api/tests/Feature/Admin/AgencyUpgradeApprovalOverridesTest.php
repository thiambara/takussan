<?php

namespace Tests\Feature\Admin;

use App\Models\Agency;
use App\Models\AgencySubscription;
use App\Models\AgencyUpgradeRequest;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencySubscriptionStatus;
use App\Models\Enums\AgencyUpgradeRequestStatus;
use App\Models\Enums\KycDossierStatus;
use App\Models\KycDossier;
use App\Models\Plan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;

/**
 * TCK-2730 (décision du porteur du 2026-11-11, option b) — le passage en pro ne fait pas disparaître
 * en silence les dérogations négociées : tant que l'abonnement ouvert en porte une (commission ou
 * quotas), l'approbation rend `409 agency_upgrade.subscription_has_overrides` avec les dérogations,
 * et rien n'est écrit. Retirées (TCK-2222), l'approbation passe (TCK-2681).
 */
class AgencyUpgradeApprovalOverridesTest extends ApiTestCase
{
    use RefreshDatabase;

    private Plan $pro;

    private Agency $agency;

    private AgencyUpgradeRequest $request;

    private AgencySubscription $courant;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo(Carbon::parse('2026-11-11 10:00:00'));
        $this->pro = Plan::query()->create([
            'code' => 'pro', 'label' => 'Pro', 'monthly_price_xof' => 50000, 'platform_fee_pct' => 3,
            'trial_days' => 0, 'limits' => ['max_agents' => 15], 'is_active' => true, 'sort_order' => 20,
        ]);
        $individuel = Plan::query()->create([
            'code' => 'individuel', 'label' => 'Individuel', 'monthly_price_xof' => 0, 'platform_fee_pct' => 5,
            'trial_days' => 0, 'limits' => ['max_active_listings' => 20], 'is_active' => true, 'sort_order' => 10,
        ]);
        $this->agency = Agency::factory()->individual()->create();
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $this->agency);
        KycDossier::query()->create([
            'subject_type' => Agency::class, 'subject_id' => $this->agency->id,
            'status' => KycDossierStatus::Verified, 'metadata' => [],
        ]);
        $this->request = AgencyUpgradeRequest::factory()->pending()->create([
            'agency_id' => $this->agency->id, 'submitted_by' => $admin->id,
        ]);
        $this->courant = AgencySubscription::query()->create([
            'agency_id' => $this->agency->id, 'plan_id' => $individuel->id, 'status' => AgencySubscriptionStatus::Active,
            'current_period_start' => now()->subWeek(), 'current_period_end' => now()->addWeeks(3),
        ]);
    }

    private function approuver(): TestResponse
    {
        $this->apiActingAsRole('super_admin');

        return $this->apiPost("/api/admin/agency-upgrade-requests/{$this->request->id}/approve", ['comment' => 'Statuts vérifiés.']);
    }

    private function deroger(array $donnees): void
    {
        $this->apiActingAsRole('super_admin');
        $this->patchJson("/api/admin/agencies/{$this->agency->id}/subscription/overrides", $donnees)->assertOk();
    }

    /** Rien n'est écrit : la demande reste en attente, l'agence individuelle, l'abonnement ouvert avec sa dérogation. */
    private function assertRienNEstEcrit(): void
    {
        $this->assertSame(AgencyUpgradeRequestStatus::Pending, $this->request->fresh()->status);
        $this->assertNull($this->request->fresh()->reviewed_at);
        $this->assertSame(AgencyKind::Individual, $this->agency->fresh()->kind);
        $this->assertNull($this->courant->fresh()->ended_at);
        $this->assertSame(1, AgencySubscription::query()->where('agency_id', $this->agency->id)->count());
        $this->assertSame(0, Activity::query()->where('event', 'agency_upgrade_approved')->count());
        Notification::assertNothingSent();
    }

    /**
     * Vérification adverse de TCK-2730 — une commission dérogée à 0 % (une exemption) est une
     * dérogation : 409, `overrides.platform_fee_pct = 0`, rien d'écrit.
     */
    public function test_une_commission_derogee_a_zero_bloque_aussi_l_approbation(): void
    {
        $this->deroger(['platform_fee_pct' => 0]);
        $this->assertNotNull($this->courant->fresh()->platform_fee_pct_override, 'prémisse : 0 est posé, pas retiré');

        $reponse = $this->approuver()->assertStatus(409)
            ->assertJsonPath('code', 'agency_upgrade.subscription_has_overrides');
        $this->assertEquals(0, $reponse->json('overrides.platform_fee_pct'));
        $this->assertNotNull($reponse->json('overrides.platform_fee_pct'));

        $this->assertRienNEstEcrit();
    }

    /** AC1 — une commission négociée : 409, la dérogation dans le corps, rien d'écrit. */
    public function test_ac1_une_commission_negociee_bloque_l_approbation(): void
    {
        $this->deroger(['platform_fee_pct' => 3]);

        $reponse = $this->approuver()->assertStatus(409)
            ->assertJsonPath('code', 'agency_upgrade.subscription_has_overrides')
            ->assertJsonMissingPath('overrides.limits');
        $this->assertEquals(3, $reponse->json('overrides.platform_fee_pct'));
        $this->assertSame(__('errors.agency_upgrade.subscription_has_overrides'), $reponse->json('message'));

        $this->assertRienNEstEcrit();
        $this->assertEquals(3, $this->courant->fresh()->platform_fee_pct_override);
    }

    /** Des quotas négociés bloquent aussi, et le corps les nomme. */
    public function test_des_quotas_negocies_bloquent_l_approbation(): void
    {
        $this->deroger(['limits' => ['max_active_listings' => 50]]);

        $this->approuver()->assertStatus(409)
            ->assertJsonPath('code', 'agency_upgrade.subscription_has_overrides')
            ->assertJsonPath('overrides.limits', ['max_active_listings' => 50])
            ->assertJsonMissingPath('overrides.platform_fee_pct');

        $this->assertRienNEstEcrit();
    }

    /** AC2 — les dérogations retirées (`updateOverrides` à null), l'approbation passe et pose le plan pro. */
    public function test_ac2_retirees_l_approbation_passe(): void
    {
        $this->deroger(['platform_fee_pct' => 3, 'limits' => ['max_active_listings' => 50]]);
        $this->approuver()->assertStatus(409);

        $this->deroger(['platform_fee_pct' => null, 'limits' => ['max_active_listings' => null]]);
        $this->approuver()->assertOk();

        $this->assertSame(AgencyKind::Standard, $this->agency->fresh()->kind);
        $this->assertNotNull($this->courant->fresh()->ended_at);
        $ouvert = AgencySubscription::query()->where('agency_id', $this->agency->id)->whereNull('ended_at')->sole();
        $this->assertSame($this->pro->id, (int) $ouvert->plan_id);
    }

    /** AC3 — un abonnement ouvert sans dérogation : approbation inchangée. */
    public function test_ac3_sans_derogation_rien_ne_change(): void
    {
        $this->approuver()->assertOk();

        $this->assertSame(AgencyKind::Standard, $this->agency->fresh()->kind);
        $this->assertSame($this->pro->id, (int) AgencySubscription::query()->where('agency_id', $this->agency->id)->whereNull('ended_at')->sole()->plan_id);
    }

    /** L'ordre des refus est gardé : une demande déjà traitée rend son refus d'abord, pas celui des dérogations. */
    public function test_l_ordre_des_refus_est_garde(): void
    {
        $this->deroger(['platform_fee_pct' => 3]);
        $this->request->update(['status' => AgencyUpgradeRequestStatus::Rejected->value]);

        $code = $this->approuver()->json('code');

        $this->assertNotSame('agency_upgrade.subscription_has_overrides', $code);
    }
}

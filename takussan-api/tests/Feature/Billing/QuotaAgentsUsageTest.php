<?php

namespace Tests\Feature\Billing;

use App\Models\Agency;
use App\Models\AgencySubscription;
use App\Models\Enums\AgencySubscriptionStatus;
use App\Models\Plan;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Billing\QuotaResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\ApiTestCase;

/**
 * TCK-2669 (AC6) — `GET /api/me/quota` dit aussi l'usage du quota d'agents : `agents.used` est le
 * nombre de profils agents ACTIFS de l'agence. `assertCanAddAgent()` lit le même compte.
 */
class QuotaAgentsUsageTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);
    }

    private function subscribe(int $maxAgents): void
    {
        $plan = Plan::query()->create([
            'code' => 'pro', 'label' => 'Pro', 'monthly_price_xof' => 50000, 'platform_fee_pct' => 3,
            'trial_days' => 0, 'limits' => ['max_agents' => $maxAgents], 'is_active' => true, 'sort_order' => 2,
        ]);
        AgencySubscription::query()->create([
            'agency_id' => $this->agency->id, 'plan_id' => $plan->id, 'status' => AgencySubscriptionStatus::Active,
            'current_period_start' => now(), 'current_period_end' => now()->addMonth(),
        ]);
    }

    private function agents(): void
    {
        AgentProfile::factory()->count(2)->create(['agency_id' => $this->agency->id]);
        AgentProfile::factory()->inactive()->create(['agency_id' => $this->agency->id]);
        AgentProfile::factory()->suspended()->create(['agency_id' => $this->agency->id]);
        AgentProfile::factory()->draft()->create(['agency_id' => $this->agency->id]);
        AgentProfile::factory()->create(); // une autre agence
    }

    public function test_ac6_agents_used_compte_les_profils_actifs(): void
    {
        $this->subscribe(5);
        $this->agents();

        $this->apiGet('/api/me/quota')->assertOk()
            ->assertJsonPath('data.agents', ['limit' => 5, 'used' => 2])
            // Les clés plates restent celles des annonces.
            ->assertJsonPath('data.limit', null)
            ->assertJsonPath('data.used', 0)
            ->assertJsonPath('data.can_create', true);
    }

    public function test_sans_abonnement_la_limite_est_nulle(): void
    {
        $this->agents();

        $this->apiGet('/api/me/quota')->assertOk()->assertJsonPath('data.agents', ['limit' => null, 'used' => 2]);
    }

    public function test_sans_agence_rien_n_est_compte(): void
    {
        $this->apiActingAsRole('customer');

        $this->apiGet('/api/me/quota')->assertOk()->assertJsonPath('data.agents', ['limit' => null, 'used' => 0]);
    }

    /**
     * Vérification adverse de TCK-2669 — l'effectif des agents et la limite du plan restent au
     * personnel : un bailleur de l'agence (profil actif propriétaire) lit `agents: null`, et le
     * quota d'annonces, déjà servi, ne change pas.
     */
    public function test_le_bailleur_ne_lit_pas_l_effectif_des_agents(): void
    {
        $this->subscribe(5);
        $this->agents();
        $landlord = User::factory()->create();
        $profile = OwnerProfile::factory()->create(['user_id' => $landlord->id, 'agency_id' => $this->agency->id]);

        $this->actingAsApi($landlord);
        $this->withHeader('X-Profile-Id', 'owner:'.$profile->id);
        $data = $this->getJson('/api/me/quota')->assertOk()->json('data');

        $this->assertArrayHasKey('agents', $data);
        $this->assertNull($data['agents']);
        $this->assertArrayHasKey('can_create', $data);
    }

    public function test_le_controle_lit_le_meme_compte(): void
    {
        $this->subscribe(3);
        $this->agents();
        $resolver = app(QuotaResolver::class);

        // 2 actifs sur 3 : une place reste, malgré les profils inactif, suspendu et brouillon.
        $resolver->assertCanAddAgent($this->agency);

        AgentProfile::factory()->create(['agency_id' => $this->agency->id]);
        try {
            $resolver->assertCanAddAgent($this->agency);
            $this->fail('Le quota d\'agents aurait dû refuser.');
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
        }
    }
}

<?php

namespace Tests\Feature\Billing;

use App\Models\Agency;
use App\Models\Plan;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-2669 (ADR-0104 § 6) — le prix du passage en pro se lit de l'API : c'est celui du plan que
 * l'approbation donnera, désigné par `billing.upgrade_plan_code` (défaut `pro`). Jamais écrit dans
 * le code.
 */
class UpgradeOfferTest extends ApiTestCase
{
    use RefreshDatabase;

    private Plan $pro;

    protected function setUp(): void
    {
        parent::setUp();
        $this->pro = Plan::query()->create([
            'code' => 'pro', 'label' => 'Pro', 'monthly_price_xof' => 50000.0, 'platform_fee_pct' => 3.0,
            'trial_days' => 0, 'limits' => ['max_agents' => 15, 'max_branches' => 3, 'max_active_listings' => 100],
            'is_active' => true, 'sort_order' => 2,
        ]);
        Plan::query()->create([
            'code' => 'business', 'label' => 'Business', 'monthly_price_xof' => 120000, 'platform_fee_pct' => 2,
            'trial_days' => 0, 'limits' => ['max_agents' => 50], 'is_active' => true, 'sort_order' => 3,
        ]);
    }

    private function individualAdmin(): Agency
    {
        $agency = Agency::factory()->individual()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        return $agency;
    }

    public function test_ac5_le_prix_est_celui_du_plan_en_base(): void
    {
        $this->individualAdmin();

        $this->apiGet('/api/me/upgrade-offer')->assertOk()
            ->assertExactJson(['data' => [
                'code' => 'pro',
                'label' => 'Pro',
                'monthly_price_xof' => 50000.0,
                'platform_fee_pct' => 3.0,
                'limits' => ['max_agents' => 15, 'max_branches' => 3, 'max_active_listings' => 100],
            ]]);

        $this->pro->update(['monthly_price_xof' => 65000]);
        $this->assertEquals(65000, $this->apiGet('/api/me/upgrade-offer')->assertOk()->json('data.monthly_price_xof'));
    }

    public function test_le_plan_est_designe_par_configuration(): void
    {
        config(['billing.upgrade_plan_code' => 'business']);
        $this->individualAdmin();

        $this->apiGet('/api/me/upgrade-offer')->assertOk()
            ->assertJsonPath('data.code', 'business');
        $this->assertEquals(120000, $this->apiGet('/api/me/upgrade-offer')->json('data.monthly_price_xof'));
    }

    public function test_le_defaut_est_pro(): void
    {
        $this->assertSame('pro', config('billing.upgrade_plan_code'));
    }

    public function test_un_plan_absent_ou_retire_rend_404(): void
    {
        $this->individualAdmin();
        $this->pro->update(['is_active' => false]);

        $this->apiGet('/api/me/upgrade-offer')->assertNotFound()->assertJsonPath('code', 'plan.upgrade_offer_missing');

        config(['billing.upgrade_plan_code' => 'inconnu']);
        $this->apiGet('/api/me/upgrade-offer')->assertNotFound()->assertJsonPath('code', 'plan.upgrade_offer_missing');
    }

    public function test_reserve_a_l_admin_d_une_agence_individuelle(): void
    {
        $standard = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $standard]);
        $this->apiGet('/api/me/upgrade-offer')->assertForbidden();

        $individual = Agency::factory()->individual()->create();
        $this->apiActingAsRole('agent', ['agency' => $individual]);
        $this->apiGet('/api/me/upgrade-offer')->assertForbidden();
    }

    public function test_sans_espace_actif_404(): void
    {
        $this->apiActingAsRole('customer');

        $this->apiGet('/api/me/upgrade-offer')->assertNotFound()->assertJsonPath('code', 'agency.active_profile_missing');
    }
}

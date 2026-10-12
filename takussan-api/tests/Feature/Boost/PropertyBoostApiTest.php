<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Property;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/** TCK-633 lot F (ADR-0061 §5, AC14) — booster un bien depuis l'espace annonceur. */
class PropertyBoostApiTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->property = Property::factory()->published()->create(['agency_id' => $this->agency->id]);
    }

    public function test_le_catalogue_ne_montre_que_les_offres_actives(): void
    {
        BoostProduct::query()->where('kind', 'bump')->update(['is_active' => false]);
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);

        $kinds = array_column($this->apiGet('/api/boost-products')->assertOk()->json('data'), 'kind');

        $this->assertNotContains('bump', $kinds);
        $this->assertCount(5, $kinds);
    }

    public function test_l_admin_booste_et_le_solde_baisse(): void
    {
        app(CreditLedger::class)->grant($this->agency, CreditLotOrigin::Welcome, 100, now()->addDays(30));
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);
        $offre = BoostProduct::query()->where('kind', 'featured')->where('duration_days', 15)->sole();

        $this->apiPost("/api/properties/{$this->property->id}/boosts", ['product_id' => $offre->id])
            ->assertCreated()
            ->assertJsonPath('data.kind', 'featured')
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.price_credits', 35)
            ->assertJsonPath('balance', 65);

        $this->apiGet("/api/properties/{$this->property->id}/boosts")->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_un_solde_insuffisant_rend_le_montant_manquant_sans_rien_acheter(): void
    {
        app(CreditLedger::class)->grant($this->agency, CreditLotOrigin::Welcome, 12, now()->addDays(30));
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);
        $offre = BoostProduct::query()->where('kind', 'featured')->where('duration_days', 7)->sole();

        $this->apiPost("/api/properties/{$this->property->id}/boosts", ['product_id' => $offre->id])
            ->assertStatus(422)
            ->assertJsonPath('code', 'credits.insufficient')
            ->assertJsonPath('params.missing', 8)
            ->assertJsonPath('params.balance', 12);
    }

    public function test_l_agent_sans_la_capacite_est_refuse(): void
    {
        app(CreditLedger::class)->grant($this->agency, CreditLotOrigin::Welcome, 100, now()->addDays(30));
        $agent = $this->apiActingAsRole('agent', ['agency' => $this->agency]);
        $this->property->update(['user_id' => $agent->id]);

        $this->apiPost("/api/properties/{$this->property->id}/boosts", ['product_id' => BoostProduct::query()->value('id')])
            ->assertForbidden();
    }

    public function test_l_offre_doit_exister(): void
    {
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);

        $this->apiPost("/api/properties/{$this->property->id}/boosts", ['product_id' => 999999])
            ->assertStatus(422)->assertJsonValidationErrors('product_id');
    }
}

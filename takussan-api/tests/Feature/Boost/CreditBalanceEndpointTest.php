<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\Enums\CreditLotOrigin;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-642 — le SEUL solde de l'espace actif, pour la pastille des barres de navigation : lue à
 * chaque page, elle ne paie ni les lots ni le journal de `GET /api/credits`.
 */
class CreditBalanceEndpointTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_l_admin_d_espace_lit_le_solde_de_son_espace_et_lui_seul(): void
    {
        $agency = Agency::factory()->create();
        $voisine = Agency::factory()->create();
        $ledger = app(CreditLedger::class);
        $ledger->grant($agency, CreditLotOrigin::Welcome, 500, now()->addDays(180));
        $ledger->grant($agency, CreditLotOrigin::AdminGrant, 40, now()->addDays(10));
        $ledger->grant($voisine, CreditLotOrigin::AdminGrant, 9000, now()->addDays(10));
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->apiGet('/api/credits/balance')
            ->assertOk()
            ->assertExactJson(['data' => ['balance' => 540]]);
    }

    public function test_le_solde_est_celui_que_rend_la_page_credits(): void
    {
        $agency = Agency::factory()->create();
        app(CreditLedger::class)->grant($agency, CreditLotOrigin::Welcome, 125, now()->addDays(30));
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $complet = $this->apiGet('/api/credits')->json('data.balance');

        $this->apiGet('/api/credits/balance')->assertJsonPath('data.balance', $complet);
    }

    public function test_l_agent_n_y_a_pas_acces(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agent', ['agency' => $agency]);

        $this->apiGet('/api/credits/balance')->assertForbidden();
    }

    public function test_sans_espace_actif_le_refus_est_nomme(): void
    {
        $this->apiActingAsRole('customer');

        $this->apiGet('/api/credits/balance')->assertStatus(422)->assertJsonPath('code', 'credits.no_space');
    }

    public function test_un_anonyme_est_refuse(): void
    {
        $this->getJson('/api/credits/balance')->assertUnauthorized();
    }
}

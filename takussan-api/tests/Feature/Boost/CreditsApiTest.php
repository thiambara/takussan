<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\Enums\CreditLotOrigin;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;

/** TCK-633 lot F (ADR-0061 §1) — le solde de l'espace actif, ses lots et son journal. */
class CreditsApiTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_l_admin_d_espace_lit_solde_lots_et_mouvements(): void
    {
        $agency = Agency::factory()->create();
        $ledger = app(CreditLedger::class);
        $ledger->grant($agency, CreditLotOrigin::Welcome, 500, now()->addDays(180));
        $ledger->grant($agency, CreditLotOrigin::AdminGrant, 40, now()->addDays(10));
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->apiGet('/api/credits?per_page=1')
            ->assertOk()
            ->assertJsonPath('data.balance', 540)
            ->assertJsonCount(2, 'data.lots')
            ->assertJsonPath('data.lots.0.origin', 'admin_grant')
            ->assertJsonPath('data.lots.0.remaining_amount', 40)
            ->assertJsonCount(1, 'movements')
            ->assertJsonPath('meta.total', 2)
            ->assertJsonPath('meta.last_page', 2);
    }

    /** @return array<string, array{string}> */
    public static function routes(): array
    {
        return ['la page' => ['/api/credits'], 'la pastille (TCK-642)' => ['/api/credits/balance']];
    }

    #[DataProvider('routes')]
    public function test_l_agent_n_y_a_pas_acces(string $route): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agent', ['agency' => $agency]);

        $this->apiGet($route)->assertForbidden();
    }

    #[DataProvider('routes')]
    public function test_sans_espace_actif_le_refus_est_nomme(string $route): void
    {
        $this->apiActingAsRole('customer');

        $this->apiGet($route)->assertStatus(422)->assertJsonPath('code', 'credits.no_space');
    }

    // --- TCK-642 (ex-`CreditBalanceEndpointTest`, versé par TCK-3017) : le SEUL solde de l'espace actif, pour la
    // pastille des barres de navigation — lue à chaque page, elle ne paie ni les lots ni le journal. -------------

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
}

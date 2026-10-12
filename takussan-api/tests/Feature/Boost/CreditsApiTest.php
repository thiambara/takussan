<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\Enums\CreditLotOrigin;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
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

    public function test_l_agent_n_y_a_pas_acces(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agent', ['agency' => $agency]);

        $this->apiGet('/api/credits')->assertForbidden();
    }

    public function test_sans_espace_actif_le_refus_est_nomme(): void
    {
        $this->apiActingAsRole('customer');

        $this->apiGet('/api/credits')->assertStatus(422)->assertJsonPath('code', 'credits.no_space');
    }
}

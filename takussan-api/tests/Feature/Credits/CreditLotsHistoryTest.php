<?php

namespace Tests\Feature\Credits;

use App\Models\Agency;
use App\Models\CreditLot;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Enums\CreditMovementType;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * TCK-2924 — `GET /api/credits/lots?filter[state]=spent|expired` : les lots qu'on ne peut plus dépenser,
 * de l'espace actif. Les états sont exclusifs : l'expiration solde aussi le lot à 0, c'est le mouvement
 * `expire` qui les distingue.
 */
class CreditLotsHistoryTest extends ApiTestCase
{
    use RefreshDatabase;

    private CreditLedger $ledger;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Http::preventStrayRequests();
        $this->travelTo(Carbon::parse('2026-11-20 10:00:00'));
        $this->ledger = app(CreditLedger::class);
    }

    private function lot(Agency $agency, int $amount, ?string $expires): CreditLot
    {
        return $this->ledger->grant($agency, CreditLotOrigin::AdminGrant, $amount, $expires !== null ? Carbon::parse($expires) : null, null, 'test');
    }

    /** @return list<int> */
    private function ids(string $query): array
    {
        return array_column($this->apiGet('/api/credits/lots'.$query)->assertOk()->json('data'), 'id');
    }

    public function test_ac1_epuise_et_expire_paraissent_chacun_dans_son_etat(): void
    {
        $agency = Agency::factory()->create();
        $other = Agency::factory()->create();

        // Épuisé : dépensé jusqu'à zéro (un seul lot vivant au moment de la dépense).
        $spent = $this->lot($agency, 10, null);
        $this->ledger->spend($agency, 10, CreditMovementType::AdminDebit);
        // Expiré, soldé par le balayage de la nuit.
        $expired = $this->lot($agency, 5, '2026-11-25 00:00');
        $this->travelTo(Carbon::parse('2026-11-26 10:00:00'));
        $this->ledger->expireDue();
        // Expiré, pas encore balayé.
        $pending = $this->lot($agency, 4, '2026-11-26 11:00');
        $this->travelTo(Carbon::parse('2026-11-26 12:00:00'));
        // Vidé avant sa date, puis la date est passée : il reste épuisé.
        $spentThenDue = $this->lot($agency, 3, '2026-11-26 13:00');
        $this->ledger->spend($agency, 3, CreditMovementType::AdminDebit);
        // Encore dépensable.
        $live = $this->lot($agency, 7, null);
        // Un autre espace, épuisé.
        $foreign = $this->lot($other, 2, null);
        $this->ledger->spend($other, 2, CreditMovementType::AdminDebit);
        $this->travelTo(Carbon::parse('2026-11-27 10:00:00'));

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $spentIds = $this->ids('?filter[state]=spent');
        sort($spentIds);
        $this->assertSame([$spent->id, $spentThenDue->id], $spentIds);
        $expiredIds = $this->ids('?filter[state]=expired');
        sort($expiredIds);
        $this->assertSame([$expired->id, $pending->id], $expiredIds);

        $all = $this->apiGet('/api/credits/lots')->assertOk()->json('data');
        $this->assertCount(4, $all);
        $this->assertNotContains($live->id, array_column($all, 'id'));
        $this->assertNotContains($foreign->id, array_column($all, 'id'));
        $states = array_column($all, 'state', 'id');
        $this->assertSame('expired', $states[$expired->id]);
        $this->assertSame('expired', $states[$pending->id]);
        $this->assertSame('spent', $states[$spent->id]);
        $this->assertSame('spent', $states[$spentThenDue->id]);
    }

    public function test_le_plus_recent_d_abord_pagine_et_sparse_fieldsets(): void
    {
        $agency = Agency::factory()->create();
        $old = $this->lot($agency, 1, null);
        $this->ledger->spend($agency, 1, CreditMovementType::AdminDebit);
        $this->travelTo(Carbon::parse('2026-11-21 10:00:00'));
        $recent = $this->lot($agency, 1, null);
        $this->ledger->spend($agency, 1, CreditMovementType::AdminDebit);

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->assertSame([$recent->id, $old->id], $this->ids(''));
        $page = $this->apiGet('/api/credits/lots?per_page=1')->assertOk();
        $this->assertSame([$recent->id], array_column($page->json('data'), 'id'));
        $this->assertSame(2, $page->json('meta.total'));

        $row = $this->apiGet('/api/credits/lots?fields[credit_lots]=id,initial_amount')->assertOk()->json('data.0');
        $this->assertSame(['id', 'initial_amount', 'state'], array_keys($row));
    }

    public function test_un_etat_inconnu_est_refuse(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->apiGet('/api/credits/lots?filter[state]=live')->assertStatus(422);
    }

    public function test_ac3_meme_garde_que_le_portefeuille(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agent', ['agency' => $agency]);
        $this->apiGet('/api/credits')->assertForbidden();
        $this->apiGet('/api/credits/lots')->assertForbidden();
        $this->apiGet('/api/credits/lots?filter[state]=live')->assertForbidden();

        $this->apiActingAsRole('customer');
        $this->apiGet('/api/credits')->assertStatus(422)->assertJsonPath('code', 'credits.no_space');
        $this->apiGet('/api/credits/lots')->assertStatus(422)->assertJsonPath('code', 'credits.no_space');
    }
}

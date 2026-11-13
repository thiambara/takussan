<?php

namespace Tests\Feature\Payout;

use App\Models\Agency;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PayoutStatus;
use App\Models\Integration;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\Profiles\OwnerProfile;
use App\Models\ServiceProviderBill;
use App\Models\User;
use App\Services\Payments\Dto\PaymentEvent;
use App\Services\Payments\Dto\WebhookAuthority;
use App\Services\Payments\PaymentGatewayService;
use App\Services\Payout\OwnerStatementSnapshots;
use App\Services\Payout\PayoutClawbacks;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\EncaissementsPlateforme;

/**
 * TCK-2760 (ADR-0100, amendement du 2026-11-12, décision 4 (a) du porteur) — le reste à verser au
 * bailleur est un SOLDE CUMULÉ arrêté au jour (`balance`), servi par le relevé, la fiche et le
 * carnet ; `totals.remaining_to_pay` et `figures.remaining_to_pay` restent l'écart de la période.
 *
 * Fixture commune : un bailleur L, commission de 10 % ; loyer d'octobre de 100 000 encaissé le
 * 5 octobre, reversé (90 000) et versé le 3 novembre ; loyer de novembre de 100 000 encaissé le
 * 5 novembre, pas encore reversé ; on lit le 20 novembre.
 */
class OwnerStatementBalanceTest extends ApiTestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use EncaissementsPlateforme;
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function rent(Lease $lease, float $amount, string $paidAt): LeasePayment
    {
        $month = substr($paidAt, 0, 7);

        return LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => $amount,
            'payment_type' => LeasePaymentType::Rent,
            'status' => 'paid',
            'paid_at' => $paidAt,
            'period_start' => "{$month}-01",
            'period_end' => date('Y-m-t', strtotime("{$month}-01")),
            'due_date' => "{$month}-05",
        ]);
    }

    /**
     * Un reversement préparé par l'application (`POST /api/payouts`), puis versé à `$processedAt`.
     *
     * @param  list<int>  $leaseIds
     * @param  list<int>  $billIds
     */
    private function paidOut(Agency $agency, User $landlord, array $leaseIds, int $net, string $processedAt, array $billIds = []): Payout
    {
        Sanctum::actingAs($this->agencyAgent($agency));
        $id = $this->postJson('/api/payouts', array_filter([
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => $leaseIds,
            'service_provider_bill_ids' => $billIds,
        ]))->assertCreated()->assertJsonPath('data.net_amount', $net)->json('data.id');
        Payout::query()->whereKey($id)->update(['status' => PayoutStatus::Completed->value, 'processed_at' => $processedAt]);

        return Payout::findOrFail($id);
    }

    /** @return array{0: Agency, 1: User, 2: Lease} la fixture commune, lue le 20 novembre */
    private function fixtureL(?callable $beforePayout = null): array
    {
        $this->travelTo('2026-10-05 10:00:00');
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $lease = $this->leaseOf($agency, $landlord, 10);
        $october = $this->rent($lease, 100_000, '2026-10-05 10:00:00');

        if ($beforePayout !== null) {
            $beforePayout($agency, $landlord);
        }

        $this->travelTo('2026-11-03 08:00:00');
        $this->paidOut($agency, $landlord, [$october->id], 90000, '2026-11-03 09:00:00');
        $this->travelTo('2026-11-05 10:00:00');
        $this->rent($lease, 100_000, '2026-11-05 10:00:00');
        $this->travelTo('2026-11-20 10:00:00');

        return [$agency, $landlord, $lease];
    }

    private function actAsAdmin(Agency $agency): void
    {
        if (isset($this->admin)) {
            Sanctum::actingAs($this->admin);

            return;
        }
        $this->admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
    }

    /** @return array<string, mixed> */
    private function statement(Agency $agency, User $landlord, string $period): array
    {
        $this->actAsAdmin($agency);

        return $this->getJson("/api/owner-statements?period={$period}&landlord_id={$landlord->id}")->assertOk()->json('data');
    }

    /** @return array<int, array<string, mixed>> par id de profil */
    private function rows(Agency $agency, string $query = ''): array
    {
        $this->actAsAdmin($agency);

        return collect($this->getJson('/api/owners?per_page=100'.$query)->assertOk()->json('data'))->keyBy('id')->all();
    }

    private function profileOf(User $landlord, Agency $agency): OwnerProfile
    {
        return OwnerProfile::query()->where('user_id', $landlord->id)->where('agency_id', $agency->id)->firstOrFail();
    }

    /** AC1 — le cas qui discrimine : le solde ne dépend pas de la période, et n'est pas le reste du mois. */
    public function test_ac1_le_solde_est_cumule_au_jour_et_ne_depend_pas_de_la_periode(): void
    {
        [$agency, $landlord] = $this->fixtureL();

        $november = $this->statement($agency, $landlord, '2026-11');
        $this->assertEquals(0, $november['totals']['remaining_to_pay'], '90 000 − 90 000 : le reste DU MOIS');
        $this->assertEquals(90000, $november['balance']['remaining_to_pay']);
        $this->assertSame('2026-11-20', $november['balance']['as_of']);

        $october = $this->statement($agency, $landlord, '2026-10');
        $this->assertEquals(90000, $october['totals']['remaining_to_pay']);
        $this->assertSame($november['balance'], $october['balance'], 'le solde ne dépend pas de la période');

        // L'attestation annuelle aussi.
        $this->assertSame($november['balance'], $this->statement($agency, $landlord, '2026')['balance']);
    }

    /**
     * AC2 — l'invariant : six mois d'histoire, avec une reprise IMPUTÉE sur un reversement terminé,
     * une facture d'intervention imputée et un reversement qui porte des pièces de deux mois — tous
     * produits par les gestes de l'application. La somme des restes mensuels rejoint le solde.
     */
    public function test_ac2_la_somme_des_restes_mensuels_est_le_solde(): void
    {
        $this->travelTo('2026-06-05 10:00:00');
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $lease = $this->leaseOf($agency, $landlord, 10);
        $rents = [];
        foreach (['06', '07', '08', '09', '10', '11'] as $month) {
            $rents[$month] = $this->rent($lease, 100_000, "2026-{$month}-05 10:00:00");
            $this->soldeParLAgence($rents[$month], $agency);
        }

        $this->travelTo('2026-07-03 08:00:00');
        $this->paidOut($agency, $landlord, [$rents['06']->id], 90000, '2026-07-03 09:00:00');

        // Deux mois dans un reversement, avec une facture d'intervention de 15 000 imputée.
        $this->travelTo('2026-09-03 08:00:00');
        $bill = ServiceProviderBill::factory()->validated()->create([
            'agency_id' => $agency->id, 'property_id' => $lease->property_id, 'amount' => 15_000,
        ]);
        $this->paidOut($agency, $landlord, [$rents['07']->id, $rents['08']->id], 165000, '2026-09-03 09:00:00', [$bill->id]);
        $this->assertNotNull($bill->refresh()->imputed_payout_id);

        // Un remboursement de 50 000 du loyer de juillet, déjà versé : une reprise de 45 000.
        $this->travelTo('2026-09-10 11:00:00');
        $this->assertSame(1, $this->refundByWebhook($rents['07'], 50_000));

        // Le reversement suivant l'impute : 90 000 avant reprise, 45 000 partent.
        $this->travelTo('2026-10-03 08:00:00');
        $september = $this->paidOut($agency, $landlord, [$rents['09']->id], 45000, '2026-10-03 09:00:00');
        $this->assertEquals(45000, $september->clawback_amount);
        $this->assertSame([], app(PayoutClawbacks::class)->outstanding($agency->id, $landlord->id)->all(), 'la reprise est imputée');

        $this->travelTo('2026-11-20 10:00:00');
        $sum = 0.0;
        foreach (['06', '07', '08', '09', '10', '11'] as $month) {
            $sum += (float) $this->statement($agency, $landlord, "2026-{$month}")['totals']['remaining_to_pay'];
        }
        $balance = $this->statement($agency, $landlord, '2026-11')['balance']['remaining_to_pay'];

        $this->assertEqualsWithDelta($sum, $balance, 0.06, 'la somme des six restes mensuels rejoint le solde');
        // Octobre et novembre, jamais reversés : 2 × 90 000.
        $this->assertEquals(180000, $balance);
    }

    /** AC2 bis — une reprise datée et NON imputée ne change pas le solde. */
    public function test_ac2_bis_une_reprise_non_imputee_ne_change_pas_le_solde(): void
    {
        $this->travelTo('2026-09-30 08:00:00');
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $lease = $this->leaseOf($agency, $landlord, 10);
        $september = $this->rent($lease, 100_000, '2026-09-05 10:00:00');
        $this->soldeParLAgence($september, $agency);
        $this->paidOut($agency, $landlord, [$september->id], 90000, '2026-09-30 09:00:00');
        $this->rent($lease, 100_000, '2026-10-05 10:00:00');

        $this->travelTo('2026-10-08 10:00:00');
        $before = $this->statement($agency, $landlord, '2026-10')['balance'];
        $this->assertEquals(90000, $before['remaining_to_pay']);

        $this->travelTo('2026-10-10 11:00:00');
        $this->assertSame(1, $this->refundByWebhook($september, 50_000));
        $outstanding = app(PayoutClawbacks::class)->outstanding($agency->id, $landlord->id);
        $this->assertCount(1, $outstanding, 'la reprise reste due, non imputée');
        $this->assertEquals(45000, $outstanding->first()->remaining);

        $after = $this->statement($agency, $landlord, '2026-10');
        $this->assertEquals(45000, $after['totals']['clawback'], 'la reprise est bien au relevé du mois');
        $this->assertEquals($before['remaining_to_pay'], $after['balance']['remaining_to_pay']);
    }

    /**
     * AC3 — le relevé envoyé : les totaux d'octobre restent ceux de l'envoi, le solde est servi au
     * jour, la base ne le garde pas, et il ne fait naître aucun rectificatif.
     */
    public function test_ac3_le_releve_envoye_sert_le_solde_au_jour_sans_le_figer(): void
    {
        [$agency, $landlord, $lease] = $this->fixtureL(function (Agency $agency, User $landlord): void {
            $this->travelTo('2026-11-01 08:00:00');
            $this->assertTrue(app(OwnerStatementSnapshots::class)->record($agency, $landlord, '2026-10', now()));
        });

        $payload = json_decode((string) DB::table(OwnerStatementSnapshots::TABLE)->where('landlord_id', $landlord->id)->value('payload'), true);
        $this->assertArrayNotHasKey('balance', $payload, 'le solde n\'est pas figé dans l\'instantané');
        $this->assertEquals(90000, $payload['totals']['remaining_to_pay']);

        $october = $this->statement($agency, $landlord, '2026-10');
        $this->assertNotNull($october['snapshot']);
        $this->assertEquals([100000, 90000, 0, 90000], [
            $october['totals']['gross'], $october['totals']['net'], $october['totals']['paid_out'], $october['totals']['remaining_to_pay'],
        ]);
        $this->assertEquals(['remaining_to_pay' => 90000, 'as_of' => '2026-11-20'], $october['balance']);
        $this->assertNull($october['rectification']);

        // Un encaissement du jour fait bouger le solde servi avec le mois envoyé, pas ses totaux.
        $this->rent($lease, 20_000, '2026-11-19 10:00:00');
        $october = $this->statement($agency, $landlord, '2026-10');
        $this->assertEquals(108000, $october['balance']['remaining_to_pay']);
        $this->assertEquals(90000, $october['totals']['remaining_to_pay']);
        $this->assertNull($october['rectification']);
    }

    /**
     * AC4 — un chiffre, trois lecteurs : le relevé, la fiche et la ligne du carnet rendent le même
     * solde ; le reste de période de la fiche vaut 0. Le filtre `has_remaining=1` le suit aussi.
     */
    public function test_ac4_le_releve_la_fiche_et_le_carnet_rendent_le_meme_solde(): void
    {
        [$agency, $landlord] = $this->fixtureL();
        $profile = $this->profileOf($landlord, $agency);

        $statement = $this->statement($agency, $landlord, '2026-11')['balance'];
        $detail = $this->getJson("/api/owners/{$profile->id}")->assertOk()->json('data');
        $row = $this->rows($agency)[$profile->id];

        $this->assertEquals(90000, $statement['remaining_to_pay']);
        $this->assertSame($statement, $detail['balance']);
        $this->assertEquals($statement['remaining_to_pay'], $row['remaining_to_pay']);
        $this->assertEquals(0, $detail['figures']['remaining_to_pay'], 'la fiche garde le reste DU MOIS sous `figures`');
        $this->assertSame('2026-11', $detail['figures']['period']);
        // L'encaissé du mois de la ligne reste celui du mois.
        $this->assertEquals(100000, $row['collected_this_month']);

        $this->assertArrayHasKey($profile->id, $this->rows($agency, '&filter[has_remaining]=1'));
        $this->assertArrayNotHasKey($profile->id, $this->rows($agency, '&filter[has_remaining]=0'));
    }

    /**
     * AC5 — le tri suit le solde, pas le reste du mois (les deux ordres sont inverses ici), et un
     * trop-versé (solde négatif, rendu tel quel sur sa ligne) n'entre pas dans la somme de tête.
     */
    public function test_ac5_le_tri_et_la_somme_suivent_le_solde(): void
    {
        $this->travelTo('2026-10-05 10:00:00');
        $agency = $this->moneyAgency();
        $p = $this->landlordOf($agency);
        $q = $this->landlordOf($agency);
        $r = $this->landlordOf($agency);
        // Q : 300 000 d'octobre jamais reversés — reste de novembre 0, solde 270 000.
        $this->rent($this->leaseOf($agency, $q, 10), 300_000, '2026-10-05 10:00:00');
        // R : un reversement terminé dont le net (140 000) dépasse celui de sa pièce (90 000), inséré
        // directement — aucun geste de l'application ne le produit. Solde −50 000.
        $rRent = $this->rent($this->leaseOf($agency, $r, 10), 100_000, '2026-10-05 10:00:00');
        $over = Payout::factory()->create([
            'agency_id' => $agency->id, 'landlord_id' => $r->id, 'payee_role' => PayeeRole::Landlord,
            'status' => PayoutStatus::Completed, 'processed_at' => '2026-11-10 09:00:00', 'net_amount' => 140_000,
            'clawback_amount' => null,
        ]);
        DB::table('payout_lease_payment')->insert([
            'payout_id' => $over->id, 'lease_payment_id' => $rRent->id, 'amount' => 100_000, 'commission_rate' => 10, 'commission_amount' => 10_000,
        ]);
        // P : 100 000 de novembre — reste de novembre 90 000, solde 90 000.
        $this->rent($this->leaseOf($agency, $p, 10), 100_000, '2026-11-05 10:00:00');
        $this->travelTo('2026-11-20 10:00:00');

        [$pId, $qId, $rId] = [$this->profileOf($p, $agency)->id, $this->profileOf($q, $agency)->id, $this->profileOf($r, $agency)->id];
        $this->assertGreaterThan(
            $this->statement($agency, $q, '2026-11')['totals']['remaining_to_pay'],
            $this->statement($agency, $p, '2026-11')['totals']['remaining_to_pay'],
            'selon le reste du mois, P passe avant Q',
        );

        $this->actAsAdmin($agency);
        // La somme de tête ne compte que les soldes positifs.
        $summary = $this->getJson('/api/owners?per_page=100')->assertOk()->json('meta.summary');
        $this->assertEquals(270000 + 90000, $summary['remaining_to_pay']);
        $this->assertSame(2, $summary['with_remaining']);

        $ids = collect($this->getJson('/api/owners?per_page=100&sort=-remaining_to_pay')->assertOk()->json('data'))->pluck('id')->all();
        // Le carnet porte aussi le profil de bailleur de l'admin incarné, sans relevé : on lit l'ordre des trois.
        $this->assertSame([$qId, $pId, $rId], array_values(array_intersect($ids, [$pId, $qId, $rId])), 'selon le solde, Q passe avant P, et le trop-versé en dernier');
        $this->assertSame($qId, $this->getJson('/api/owners?per_page=1&sort=-remaining_to_pay')->json('data.0.id'));

        $rows = $this->rows($agency);
        $this->assertEquals(-50000, $rows[$rId]['remaining_to_pay'], 'le trop-versé est rendu négatif');
        $this->assertEquals(270000, $rows[$qId]['remaining_to_pay']);

    }

    /** AC6 — le carnet d'une page de 2 bailleurs et celui d'une page de 6 coûtent le même nombre de requêtes. */
    public function test_ac6_le_nombre_de_requetes_ne_depend_pas_du_nombre_de_bailleurs(): void
    {
        $this->travelTo('2026-11-20 10:00:00');
        $agency = $this->moneyAgency();
        $seed = function (int $n) use ($agency): void {
            for ($i = 0; $i < $n; $i++) {
                $landlord = $this->landlordOf($agency);
                $lease = $this->leaseOf($agency, $landlord, 10);
                $this->rent($lease, 100_000, '2026-10-05 10:00:00');
                $this->rent($lease, 100_000, '2026-11-05 10:00:00');
                Payout::factory()->create([
                    'agency_id' => $agency->id, 'landlord_id' => $landlord->id, 'payee_role' => PayeeRole::Landlord,
                    'status' => PayoutStatus::Completed, 'processed_at' => '2026-11-03 09:00:00', 'net_amount' => 90_000,
                ]);
            }
        };
        $count = function () use ($agency): int {
            $this->actAsAdmin($agency);
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson('/api/owners?per_page=100&include=user&sort=-remaining_to_pay&filter[has_remaining]=1')->assertOk();
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };

        $seed(2);
        $count(); // échauffement : les capacités du rôle se lisent une fois par processus
        $two = $count();
        $seed(4);
        $six = $count();

        $this->assertSame($two, $six, "2 bailleurs : {$two} requêtes ; 6 : {$six}");
    }

    private function refundByWebhook(LeasePayment $payment, int $amount): int
    {
        $payment->refresh();
        $integration = Integration::query()->findOrFail($payment->metadata['gateway']['integration_id']);

        return app(PaymentGatewayService::class)->applyEventToMatchingPayment(new PaymentEvent(
            'wave',
            PaymentEvent::TYPE_REFUNDED,
            $payment->metadata['gateway']['settled_by'],
            ['amount' => (string) $amount, 'currency' => 'XOF'],
            WebhookAuthority::of($integration),
        ));
    }
}

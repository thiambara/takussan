<?php

namespace Tests\Feature\Dashboard;

use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;

/**
 * TCK-2623 — « Loyers de novembre : 8 reçus sur 14 » : `finance.rent_month` du bailleur, sur les seules
 * échéances de LOYER de ses baux dues dans le mois courant (heure de Dakar). Une caution n'est jamais
 * une échéance ; une échéance annulée n'est plus attendue.
 */
class OwnerRentMonthTest extends ApiTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-11-10 10:00:00', 'Africa/Dakar'));
    }

    /** @param  array<string, mixed>  $autres */
    private function echeance(Lease $lease, string $dueDate, PaymentStatus $status, LeasePaymentType $type = LeasePaymentType::Rent, int $montant = 100_000, array $autres = []): LeasePayment
    {
        return LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => $montant,
            'payment_type' => $type,
            'status' => $status,
            'due_date' => $dueDate,
            'period_start' => substr($dueDate, 0, 8).'01',
            'paid_at' => $status === PaymentStatus::Paid ? now() : null,
            ...$autres,
        ]);
    }

    /** TCK-2774 — les trois segments, sur les deux routes, et l'invariant reçus + retard + à venir = attendus. */
    private function assertSegments(int $recus, int $enRetard, int $aVenir, int $attendus): void
    {
        $this->assertSame($attendus, $recus + $enRetard + $aVenir, 'invariant du scénario');
        foreach (['/api/dashboard/owner' => 'data.finance.rent_month', '/api/dashboard/me' => 'data.metrics.rent_month'] as $route => $chemin) {
            $bloc = $this->apiGet($route)->assertOk()->json($chemin);
            $this->assertSame(
                ['received_count' => $recus, 'overdue_count' => $enRetard, 'upcoming_count' => $aVenir, 'expected_count' => $attendus],
                ['received_count' => $bloc['received_count'], 'overdue_count' => $bloc['overdue_count'], 'upcoming_count' => $bloc['upcoming_count'], 'expected_count' => $bloc['expected_count']],
                $route,
            );
        }
    }

    /** AC4. */
    public function test_ac4_huit_recus_sur_quatorze_caution_et_annulee_exclues(): void
    {
        $owner = $this->apiActingAsRole('owner');
        $baux = Lease::factory()->active()->count(2)->create(['landlord_id' => $owner->id]);

        // 14 loyers de novembre, dont 8 soldés.
        foreach (range(1, 14) as $i) {
            $this->echeance($baux[$i % 2], sprintf('2026-11-%02d', min($i * 2, 30)), $i <= 8 ? PaymentStatus::Paid : PaymentStatus::Pending);
        }
        // Une caution, une restitution de caution et des charges du mois : pas des loyers.
        $this->echeance($baux[0], '2026-11-05', PaymentStatus::Paid, LeasePaymentType::Deposit);
        $this->echeance($baux[0], '2026-11-05', PaymentStatus::Pending, LeasePaymentType::DepositRefund);
        $this->echeance($baux[1], '2026-11-05', PaymentStatus::Paid, LeasePaymentType::Charges);
        // Un loyer annulé (renouvellement) n'est plus attendu.
        $this->echeance($baux[1], '2026-11-05', PaymentStatus::Cancelled);
        // Octobre et décembre : hors du mois.
        $this->echeance($baux[0], '2026-10-31', PaymentStatus::Paid);
        $this->echeance($baux[0], '2026-12-01', PaymentStatus::Pending);
        // Le loyer d'un autre bailleur.
        $this->echeance(Lease::factory()->active()->create(['landlord_id' => User::factory()->create()->id]), '2026-11-05', PaymentStatus::Paid);

        $reponse = $this->apiGet('/api/dashboard/owner')->assertOk()
            ->assertJsonPath('data.finance.rent_month.received_count', 8)
            ->assertJsonPath('data.finance.rent_month.expected_count', 14);
        $this->assertEquals(800_000, $reponse->json('data.finance.rent_month.received_amount'));

        $this->apiGet('/api/dashboard/me')->assertOk()
            ->assertJsonPath('data.metrics.rent_month.received_count', 8)
            ->assertJsonPath('data.metrics.rent_month.expected_count', 14);
    }

    /** Une échéance en échec de paiement reste attendue : elle peut repasser à payée. */
    public function test_une_echeance_en_echec_reste_attendue(): void
    {
        $owner = $this->apiActingAsRole('owner');
        $bail = Lease::factory()->active()->create(['landlord_id' => $owner->id]);
        $this->echeance($bail, '2026-11-05', PaymentStatus::Failed);
        $this->echeance($bail, '2026-11-06', PaymentStatus::Late);

        $reponse = $this->apiGet('/api/dashboard/owner')->assertOk()
            ->assertJsonPath('data.finance.rent_month.received_count', 0)
            ->assertJsonPath('data.finance.rent_month.expected_count', 2);
        $this->assertEquals(0, $reponse->json('data.finance.rent_month.received_amount'));
    }

    /** TCK-2774, AC1 — le 13 novembre : 8 soldés, 3 échus le 5 non soldés (dont un `failed`), 3 dus le 20. */
    public function test_tck2774_ac1_huit_recus_trois_en_retard_trois_a_venir(): void
    {
        $this->travelTo(Carbon::parse('2026-11-13 10:00:00', 'Africa/Dakar'));
        $owner = $this->apiActingAsRole('owner');
        $baux = Lease::factory()->active()->count(2)->create(['landlord_id' => $owner->id]);

        foreach (range(1, 8) as $i) {
            $this->echeance($baux[$i % 2], sprintf('2026-11-%02d', $i), PaymentStatus::Paid);
        }
        $this->echeance($baux[0], '2026-11-05', PaymentStatus::Pending, montant: 300_000);
        $this->echeance($baux[1], '2026-11-05', PaymentStatus::Late, montant: 300_000);
        $this->echeance($baux[0], '2026-11-05', PaymentStatus::Failed, montant: 300_000);
        foreach (range(1, 3) as $i) {
            $this->echeance($baux[$i % 2], '2026-11-20', PaymentStatus::Pending, montant: 250_000);
        }

        $this->assertSegments(recus: 8, enRetard: 3, aVenir: 3, attendus: 14);
        $bloc = $this->apiGet('/api/dashboard/me')->assertOk()->json('data.metrics.rent_month');
        $this->assertEquals(900_000, $bloc['overdue_amount']);
        $this->assertEquals(750_000, $bloc['upcoming_amount']);
    }

    /**
     * TCK-2774, AC2 — borné au mois : un loyer d'octobre non soldé (l'impayé du bailleur, que `overdue_*`
     * sert déjà) et une caution de novembre non soldée ne changent aucun compte.
     */
    public function test_tck2774_ac2_loyer_d_octobre_et_caution_hors_des_segments(): void
    {
        $this->travelTo(Carbon::parse('2026-11-13 10:00:00', 'Africa/Dakar'));
        $owner = $this->apiActingAsRole('owner');
        $bail = Lease::factory()->active()->create(['landlord_id' => $owner->id]);
        $this->echeance($bail, '2026-11-05', PaymentStatus::Paid);
        $this->echeance($bail, '2026-11-06', PaymentStatus::Pending);
        $this->echeance($bail, '2026-11-25', PaymentStatus::Pending);

        $this->echeance($bail, '2026-10-05', PaymentStatus::Pending);
        $this->echeance($bail, '2026-10-31', PaymentStatus::Late);
        $this->echeance($bail, '2026-11-05', PaymentStatus::Pending, LeasePaymentType::Deposit);
        $this->echeance($bail, '2026-11-20', PaymentStatus::Pending, LeasePaymentType::Deposit);
        $this->echeance($bail, '2026-12-05', PaymentStatus::Pending);
        $this->echeance($bail, '2026-11-04', PaymentStatus::Cancelled);

        $this->assertSegments(recus: 1, enRetard: 1, aVenir: 1, attendus: 3);
        $bloc = $this->apiGet('/api/dashboard/owner')->assertOk()->json('data.finance.rent_month');
        $this->assertEquals(100_000, $bloc['overdue_amount']);
        $this->assertEquals(100_000, $bloc['upcoming_amount']);
        // L'impayé du bailleur, toutes périodes, compte bien octobre : les deux ne se confondent pas.
        $this->assertGreaterThanOrEqual(3, $this->apiGet('/api/dashboard/owner')->json('data.finance.overdue_count'));
    }

    /** TCK-2774, AC3 — dû aujourd'hui (le 13) : à venir ; dû hier (le 12) : en retard. */
    public function test_tck2774_ac3_du_aujourd_hui_est_a_venir_du_hier_en_retard(): void
    {
        $this->travelTo(Carbon::parse('2026-11-13 10:00:00', 'Africa/Dakar'));
        $owner = $this->apiActingAsRole('owner');
        $bail = Lease::factory()->active()->create(['landlord_id' => $owner->id]);
        $this->echeance($bail, '2026-11-13', PaymentStatus::Pending);
        $this->echeance($bail, '2026-11-12', PaymentStatus::Pending);

        $this->assertSegments(recus: 0, enRetard: 1, aVenir: 1, attendus: 2);
    }

    /** TCK-2774, AC4 — 300 000 dont 100 000 versés : en retard de 200 000, le reste dû. */
    public function test_tck2774_ac4_le_montant_en_retard_est_le_reste_du(): void
    {
        $this->travelTo(Carbon::parse('2026-11-13 10:00:00', 'Africa/Dakar'));
        $owner = $this->apiActingAsRole('owner');
        $bail = Lease::factory()->active()->create(['landlord_id' => $owner->id]);
        $this->echeance($bail, '2026-11-05', PaymentStatus::PartiallyPaid, montant: 300_000, autres: ['metadata' => ['paid_amount' => 100_000]]);
        $this->echeance($bail, '2026-11-25', PaymentStatus::Pending, montant: 300_000, autres: ['metadata' => ['paid_amount' => 50_000]]);

        $bloc = $this->apiGet('/api/dashboard/me')->assertOk()->json('data.metrics.rent_month');
        $this->assertSame(1, $bloc['overdue_count']);
        $this->assertEquals(200_000, $bloc['overdue_amount']);
        $this->assertEquals(250_000, $bloc['upcoming_amount']);
    }

    /**
     * TCK-2774 — le reste dû est l'accesseur `remaining_amount` (celui de l'historique des paiements),
     * statut par statut des non soldées, `refunded` compris : pas une seconde définition.
     */
    public function test_tck2774_le_montant_est_la_somme_des_remaining_amount(): void
    {
        $this->travelTo(Carbon::parse('2026-11-13 10:00:00', 'Africa/Dakar'));
        $owner = $this->apiActingAsRole('owner');
        $bail = Lease::factory()->active()->create(['landlord_id' => $owner->id]);
        $echeances = collect([
            $this->echeance($bail, '2026-11-02', PaymentStatus::Pending, montant: 120_000),
            $this->echeance($bail, '2026-11-03', PaymentStatus::Late, montant: 130_000, autres: ['metadata' => ['paid_amount' => 30_000]]),
            $this->echeance($bail, '2026-11-04', PaymentStatus::PartiallyPaid, montant: 140_000, autres: ['metadata' => ['paid_amount' => 40_000]]),
            $this->echeance($bail, '2026-11-06', PaymentStatus::Failed, montant: 150_000),
            $this->echeance($bail, '2026-11-07', PaymentStatus::Refunded, montant: 160_000, autres: ['refund_amount' => 60_000]),
        ])->map->fresh();

        $bloc = $this->apiGet('/api/dashboard/owner')->assertOk()->json('data.finance.rent_month');
        $this->assertSame(5, $bloc['overdue_count']);
        $this->assertEquals(round($echeances->sum(fn (LeasePayment $p) => (float) $p->remaining_amount), 2), $bloc['overdue_amount']);
        $this->assertEquals(0, $bloc['upcoming_amount']);
    }

    /** TCK-2774 — sur le mois passé (`period=last_month`), tout non soldé est en retard, rien n'est à venir. */
    public function test_tck2774_le_mois_passe_n_a_rien_a_venir(): void
    {
        $this->travelTo(Carbon::parse('2026-11-13 10:00:00', 'Africa/Dakar'));
        $owner = $this->apiActingAsRole('owner');
        $bail = Lease::factory()->active()->create(['landlord_id' => $owner->id]);
        $this->echeance($bail, '2026-10-05', PaymentStatus::Paid);
        $this->echeance($bail, '2026-10-30', PaymentStatus::Pending);

        $this->apiGet('/api/dashboard/owner?period=last_month')->assertOk()
            ->assertJsonPath('data.finance.rent_month.received_count', 1)
            ->assertJsonPath('data.finance.rent_month.overdue_count', 1)
            ->assertJsonPath('data.finance.rent_month.upcoming_count', 0)
            ->assertJsonPath('data.finance.rent_month.expected_count', 2);
    }
}

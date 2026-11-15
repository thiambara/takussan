<?php

namespace Tests\Feature\Payments;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2733 (décision du porteur du 2026-11-11, option a) — le registre des encaissements garde les
 * cautions, que la tuile « Encaissé » exclut, et dit leur part : `meta.totals.deposits_count` et
 * `deposits_amount`, sur la même sélection que les autres totaux (avant la page). La caution rendue
 * n'en est pas.
 */
class PaymentHistoryDepositsTotalsTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private Lease $avecCautions;

    private Lease $sansCaution;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-15 10:00:00');
        $this->agency = Agency::factory()->create();
        $this->avecCautions = Lease::factory()->active()->create(['agency_id' => $this->agency->id]);
        $this->sansCaution = Lease::factory()->active()->create(['agency_id' => $this->agency->id]);

        // Octobre : 3 loyers payés (300 000) et 2 cautions payées (450 000), sans pénalité ni réservation.
        $this->ligne($this->avecCautions, LeasePaymentType::Rent, 100_000, '2026-10-05 09:00:00');
        $this->ligne($this->avecCautions, LeasePaymentType::Deposit, 200_000, '2026-10-06 09:00:00');
        $this->ligne($this->sansCaution, LeasePaymentType::Rent, 100_000, '2026-10-07 09:00:00');
        $this->ligne($this->sansCaution, LeasePaymentType::Rent, 100_000, '2026-10-08 09:00:00');
        $this->ligne($this->avecCautions, LeasePaymentType::Deposit, 250_000, '2026-10-09 09:00:00');
    }

    private function ligne(Lease $lease, LeasePaymentType $type, float $montant, string $payeLe): LeasePayment
    {
        return LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payment_type' => $type,
            'amount' => $montant,
            'status' => PaymentStatus::Paid,
            'paid_at' => $payeLe,
            'due_date' => '2026-10-05',
            'period_start' => '2026-10-01',
            'period_end' => '2026-10-31',
            'late_fee_amount' => null,
        ]);
    }

    private function octobre(string $plus = ''): TestResponse
    {
        return $this->getJson('/api/payments/history?filter[status]=paid&filter[paid_from]=2026-10-01&filter[paid_to]=2026-10-31'.$plus)->assertOk();
    }

    /** AC1 — 750 000 encaissés, dont 2 cautions pour 450 000 ; hors cautions, le registre égale la tuile. */
    public function test_ac1_le_registre_dit_la_part_des_cautions_et_rejoint_la_tuile(): void
    {
        $this->actingAsApi($this->agencyAdmin($this->agency));

        $totaux = $this->octobre()->json('meta.totals');
        $tuile = $this->getJson("/api/agencies/{$this->agency->id}/finance/summary?period=2026-10")->assertOk()->json('data.collected');

        $this->assertEquals(750_000, $totaux['paid_amount']);
        $this->assertSame(5, $totaux['count']);
        $this->assertSame(2, $totaux['deposits_count']);
        $this->assertEquals(450_000, $totaux['deposits_amount']);
        $this->assertEquals(300_000, $tuile['amount'], 'prémisse : la tuile exclut les cautions');
        $this->assertEquals($tuile['amount'], $totaux['paid_amount'] - $totaux['deposits_amount']);
    }

    /** AC2 — `per_page=1` : la part des cautions porte sur toute la sélection, pas sur la page. */
    public function test_ac2_la_part_des_cautions_ne_depend_pas_de_la_page(): void
    {
        $this->actingAsApi($this->agencyAdmin($this->agency));

        foreach ([1, 2, 5] as $page) {
            $totaux = $this->octobre("&per_page=1&page={$page}")->json('meta.totals');
            $this->assertSame(2, $totaux['deposits_count'], "page {$page}");
            $this->assertEquals(450_000, $totaux['deposits_amount'], "page {$page}");
        }
    }

    /** AC3 — une caution rendue payée dans le mois n'entre pas dans `deposits_amount`. */
    public function test_ac3_la_caution_rendue_n_est_pas_une_caution_encaissee(): void
    {
        $this->ligne($this->avecCautions, LeasePaymentType::DepositRefund, 200_000, '2026-10-20 09:00:00');
        $this->actingAsApi($this->agencyAdmin($this->agency));

        $reponse = $this->getJson('/api/payments/history?filter[paid_from]=2026-10-01&filter[paid_to]=2026-10-31&per_page=100')->assertOk();

        $this->assertContains('deposit_refund', array_column($reponse->json('data'), 'payment_type'), 'prémisse : la caution rendue est au registre');
        $this->assertSame(2, $reponse->json('meta.totals.deposits_count'));
        $this->assertEquals(450_000, $reponse->json('meta.totals.deposits_amount'));
    }

    /** AC4 — le registre d'un bail sans caution rend 0 et 0, et les clés sont là. */
    public function test_ac4_un_bail_sans_caution_rend_zero(): void
    {
        $this->actingAsApi($this->agencyAdmin($this->agency));

        $totaux = $this->getJson("/api/payments/history?filter[entity_type]=lease&filter[entity_id]={$this->sansCaution->id}")
            ->assertOk()->json('meta.totals');

        $this->assertSame(2, $totaux['count']);
        $this->assertSame(0, $totaux['deposits_count']);
        $this->assertEquals(0, $totaux['deposits_amount']);
    }

    /**
     * Vérification adverse de TCK-2733 — `deposit` nomme aussi l'ACOMPTE d'une réservation
     * (`BookingPaymentType::Deposit`, « arrhes »), un revenu que la tuile compte : il n'entre pas dans
     * la part des cautions, et le registre hors cautions rejoint toujours la tuile.
     */
    public function test_l_acompte_d_une_reservation_n_est_pas_une_caution(): void
    {
        $bien = Property::factory()->create(['agency_id' => $this->agency->id]);
        $reservation = Booking::factory()->create(['property_id' => $bien->id, 'agency_id' => $this->agency->id]);
        BookingPayment::factory()->create([
            'booking_id' => $reservation->id,
            'payment_type' => BookingPaymentType::Deposit,
            'amount' => 90_000,
            'status' => PaymentStatus::Paid,
            'paid_at' => '2026-10-12 09:00:00',
        ]);
        $this->actingAsApi($this->agencyAdmin($this->agency));

        $reponse = $this->octobre('&per_page=100');
        $totaux = $reponse->json('meta.totals');
        $tuile = $this->getJson("/api/agencies/{$this->agency->id}/finance/summary?period=2026-10")->assertOk()->json('data.collected');

        $this->assertContains('booking', array_column($reponse->json('data'), 'source'), 'prémisse : l\'acompte est au registre');
        $this->assertEquals(840_000, $totaux['paid_amount']);
        $this->assertSame(2, $totaux['deposits_count']);
        $this->assertEquals(450_000, $totaux['deposits_amount']);
        $this->assertEquals(390_000, $tuile['amount'], 'prémisse : la tuile compte l\'acompte');
        $this->assertEquals($tuile['amount'], $totaux['paid_amount'] - $totaux['deposits_amount']);
    }

    /** Vérification adverse de TCK-2733 — une caution réglée en partie compte pour ce qui est réglé, pas pour son montant. */
    public function test_une_caution_partiellement_payee_compte_ce_qui_est_regle(): void
    {
        LeasePayment::factory()->create([
            'lease_id' => $this->avecCautions->id,
            'payment_type' => LeasePaymentType::Deposit,
            'amount' => 300_000,
            'status' => PaymentStatus::PartiallyPaid,
            'metadata' => ['paid_amount' => 120_000],
            'paid_at' => '2026-10-15 09:00:00',
            'due_date' => '2026-10-05',
            'period_start' => '2026-10-01',
            'period_end' => '2026-10-31',
            'late_fee_amount' => null,
        ]);
        $this->actingAsApi($this->agencyAdmin($this->agency));

        $totaux = $this->getJson('/api/payments/history?filter[paid_from]=2026-10-01&filter[paid_to]=2026-10-31')->assertOk()->json('meta.totals');

        $this->assertSame(3, $totaux['deposits_count']);
        $this->assertEquals(570_000, $totaux['deposits_amount']);
    }

    /** Les clés d'avant ne changent pas, et la part des cautions suit le cloisonnement du lecteur. */
    public function test_les_totaux_d_avant_et_le_cloisonnement_sont_gardes(): void
    {
        $voisine = Agency::factory()->create();
        $this->ligne(Lease::factory()->active()->create(['agency_id' => $voisine->id]), LeasePaymentType::Deposit, 999_000, '2026-10-10 09:00:00');
        $this->actingAsApi($this->agencyAdmin($this->agency));

        $totaux = $this->octobre()->json('meta.totals');

        $this->assertSame(['count', 'amount', 'paid_amount', 'remaining_amount', 'deposits_count', 'deposits_amount'], array_keys($totaux));
        $this->assertEquals(750_000, $totaux['amount']);
        $this->assertEquals(0, $totaux['remaining_amount']);
        $this->assertEquals(450_000, $totaux['deposits_amount']);
    }
}

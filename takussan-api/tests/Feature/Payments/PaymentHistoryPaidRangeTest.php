<?php

namespace Tests\Feature\Payments;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * Refus de TCK-2659 (M1) — sur l'écran « Argent », la tuile « Encaissé en octobre » compte les
 * paiements dont `paid_at` tombe dans le mois de Dakar (`finance/summary`), et le registre qu'elle
 * ouvre filtrait par `date_from`/`date_to`, qui retiennent `paid_at` OU `period_start` : un loyer
 * d'octobre payé en novembre comptait dans les deux mois, et un loyer jamais payé dans le registre des
 * « payés » d'octobre par sa période. `filter[paid_from]`/`filter[paid_to]` bornent l'ENCAISSÉ, sur
 * `paid_at` seul — le sens de la tuile. `date_from`/`date_to` gardent le leur pour les autres écrans.
 */
class PaymentHistoryPaidRangeTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private Lease $lease;

    private LeasePayment $a;

    private LeasePayment $b;

    private LeasePayment $c;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-15 10:00:00');
        $this->agency = Agency::factory()->create();
        $this->lease = Lease::factory()->active()->create(['agency_id' => $this->agency->id, 'monthly_rent' => 100_000]);
        // A : loyer d'octobre, payé le 3 novembre.
        $this->a = $this->echeance(111_000, PaymentStatus::Paid, '2026-11-03 09:00:00', '2026-10');
        // B : loyer de septembre, payé le 10 octobre.
        $this->b = $this->echeance(222_000, PaymentStatus::Paid, '2026-10-10 09:00:00', '2026-09');
        // C : loyer d'octobre, en retard, jamais payé.
        $this->c = $this->echeance(444_000, PaymentStatus::Late, null, '2026-10');
    }

    private function echeance(float $montant, PaymentStatus $statut, ?string $payeLe, string $mois): LeasePayment
    {
        $debut = Carbon::parse("{$mois}-01");

        return LeasePayment::factory()->create([
            'lease_id' => $this->lease->id,
            'payer_id' => $this->lease->tenant_id ?? Customer::factory()->create(['agency_id' => $this->agency->id])->id,
            'amount' => $montant,
            'status' => $statut,
            'paid_at' => $payeLe,
            'due_date' => $debut->copy()->addDays(4)->toDateString(),
            'period_start' => $debut->toDateString(),
            'period_end' => $debut->copy()->endOfMonth()->toDateString(),
        ]);
    }

    /** @return list<int> */
    private function lignes(string $requete): array
    {
        $ids = array_column($this->getJson("/api/payments/history?per_page=100&{$requete}")->assertOk()->json('data'), 'id');
        sort($ids);

        return $ids;
    }

    public function test_octobre_rend_b_seul_novembre_a_seul_et_c_jamais(): void
    {
        $this->actingAsApi($this->agencyAdmin($this->agency));

        $this->assertSame([$this->b->id], $this->lignes('filter[paid_from]=2026-10-01&filter[paid_to]=2026-10-31'));
        $this->assertSame([$this->a->id], $this->lignes('filter[paid_from]=2026-11-01&filter[paid_to]=2026-11-30'));
        $this->assertSame([$this->b->id], $this->lignes('filter[status]=paid&filter[paid_from]=2026-10-01&filter[paid_to]=2026-10-31'));
        // C n'a pas de `paid_at` : ni avec un statut d'impayé, ni sur une borne ouverte.
        $this->assertSame([], $this->lignes('filter[status]=late&filter[paid_from]=2026-10-01&filter[paid_to]=2026-10-31'));
        $this->assertNotContains($this->c->id, $this->lignes('filter[paid_from]=2026-01-01'));
        $this->assertNotContains($this->c->id, $this->lignes('filter[paid_to]=2026-12-31'));
    }

    public function test_le_registre_d_octobre_suit_la_tuile_encaisse_en_octobre(): void
    {
        $this->actingAsApi($this->agencyAdmin($this->agency));

        $tuile = $this->getJson("/api/agencies/{$this->agency->id}/finance/summary?period=2026-10")->assertOk()->json('data.collected');
        $registre = $this->getJson('/api/payments/history?filter[status]=paid&filter[paid_from]=2026-10-01&filter[paid_to]=2026-10-31')
            ->assertOk()->json('meta.totals');

        $this->assertEquals(222_000.0, $tuile['amount']);
        $this->assertEquals($tuile['amount'], $registre['paid_amount']);
        $this->assertSame($tuile['count'], $registre['count']);
    }

    public function test_les_bornes_du_jour_a_dakar(): void
    {
        // Dakar est à UTC+0 : 23 h 30 le 31 octobre est encore octobre ; 00 h 10 le 1er novembre, novembre.
        $fin = $this->echeance(10_000, PaymentStatus::Paid, '2026-10-31 23:30:00', '2026-10');
        $debut = $this->echeance(20_000, PaymentStatus::Paid, '2026-11-01 00:10:00', '2026-11');
        $premier = $this->echeance(30_000, PaymentStatus::Paid, '2026-10-01 00:00:00', '2026-10');
        // Minuit pile le 1er novembre : novembre SEUL — la borne haute est exclusive (contre-vérification de TCK-2659, P4).
        $minuit = $this->echeance(40_000, PaymentStatus::Paid, '2026-11-01 00:00:00', '2026-11');

        $this->actingAsApi($this->agencyAdmin($this->agency));

        $octobre = $this->lignes('filter[paid_from]=2026-10-01&filter[paid_to]=2026-10-31');
        $this->assertSame(collect([$this->b->id, $fin->id, $premier->id])->sort()->values()->all(), $octobre);
        $this->assertContains($debut->id, $this->lignes('filter[paid_from]=2026-11-01&filter[paid_to]=2026-11-30'));
        $this->assertContains($minuit->id, $this->lignes('filter[paid_from]=2026-11-01&filter[paid_to]=2026-11-30'));
        $this->assertSame([$fin->id], $this->lignes('filter[paid_from]=2026-10-31&filter[paid_to]=2026-10-31'));
    }

    public function test_un_acompte_de_reservation_se_borne_aussi_sur_paid_at_seul(): void
    {
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $booking = Booking::factory()->create(['property_id' => $property->id, 'agency_id' => $this->agency->id]);
        // Créé en octobre, payé en novembre : pas un encaissement d'octobre (`date_from` le prendrait par `created_at`).
        $acompte = BookingPayment::factory()->create([
            'booking_id' => $booking->id, 'status' => PaymentStatus::Paid, 'amount' => 40_000,
            'created_at' => '2026-10-20 09:00:00', 'paid_at' => '2026-11-02 09:00:00',
        ]);

        $this->actingAsApi($this->agencyAdmin($this->agency));

        $this->assertNotContains($acompte->id, $this->lignes('filter[paid_from]=2026-10-01&filter[paid_to]=2026-10-31'));
        $this->assertContains($acompte->id, $this->lignes('filter[paid_from]=2026-11-01&filter[paid_to]=2026-11-30'));
    }

    public function test_date_from_et_date_to_gardent_leur_sens(): void
    {
        $this->actingAsApi($this->agencyAdmin($this->agency));

        // A et C par leur période d'octobre, B par son paiement d'octobre.
        $this->assertSame(
            collect([$this->a->id, $this->b->id, $this->c->id])->sort()->values()->all(),
            $this->lignes('filter[date_from]=2026-10-01&filter[date_to]=2026-10-31'),
        );
    }

    /**
     * Refus de TCK-2659 (M2) — `meta.totals` sort à un agent sans `reports.view_agency`. Il n'y est que
     * la somme des lignes que CE lecteur lit déjà, une à une : même périmètre, mêmes filtres, avant
     * pagination (TCK-2331). Épinglé page par page, avec une agence voisine qui ne doit rien y ajouter.
     */
    public function test_les_totaux_sont_la_somme_des_lignes_lisibles_par_ce_lecteur(): void
    {
        $voisine = Agency::factory()->create();
        $bailAilleurs = Lease::factory()->active()->create(['agency_id' => $voisine->id]);
        LeasePayment::factory()->create([
            'lease_id' => $bailAilleurs->id, 'amount' => 999_000, 'status' => PaymentStatus::Paid,
            'paid_at' => '2026-10-15 09:00:00', 'due_date' => '2026-10-05',
        ]);
        $this->echeance(50_000, PaymentStatus::Paid, '2026-10-20 09:00:00', '2026-10');

        $agent = $this->agencyAgent($this->agency);
        $this->assertFalse($agent->can('viewReports', $this->agency));
        $this->actingAsApi($agent);

        $filtre = 'filter[status]=paid&filter[paid_from]=2026-10-01&filter[paid_to]=2026-10-31';
        $premiere = $this->getJson("/api/payments/history?{$filtre}&per_page=1")->assertOk();
        $lues = collect(range(1, (int) $premiere->json('meta.last_page')))
            ->flatMap(fn (int $page) => $this->getJson("/api/payments/history?{$filtre}&per_page=1&page={$page}")->assertOk()->json('data'));

        $this->assertCount(2, $lues);
        $this->assertSame($lues->count(), $premiere->json('meta.totals.count'));
        $this->assertEquals($lues->sum('paid_amount'), $premiere->json('meta.totals.paid_amount'));
        $this->assertEquals($lues->sum('amount'), $premiere->json('meta.totals.amount'));
        $this->assertEquals($lues->sum('remaining_amount'), $premiere->json('meta.totals.remaining_amount'));
        $this->assertEquals(272_000.0, $premiere->json('meta.totals.paid_amount'));
    }

    public function test_une_date_illisible_rend_422(): void
    {
        $this->actingAsApi($this->agencyAdmin($this->agency));

        foreach (['filter[paid_from]=bof', 'filter[paid_to]=2026-13-45', 'filter[paid_from][]=2026-10-01'] as $requete) {
            $this->getJson("/api/payments/history?{$requete}")->assertStatus(422);
        }
    }
}

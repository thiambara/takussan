<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;

/**
 * TCK-2865 — `include=timeseries` : `overdue` (agence), l'impayé EN FIN DE MOIS au reste dû, sur la règle de
 * `CollectedPayments::leaseOwed()` appliquée à la date de fin du mois (AC3, AC5) ; `expected` (bailleur), la somme des
 * loyers échus du mois (AC4).
 */
class TimeseriesOverdueExpectedTest extends ApiTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-11-13 10:00:00', 'Africa/Dakar'));
    }

    private function echeance(Lease $lease, string $due, int $montant, PaymentStatus $statut, ?string $payeLe = null, LeasePaymentType $type = LeasePaymentType::Rent): LeasePayment
    {
        return LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => $montant,
            'payment_type' => $type,
            'status' => $statut,
            'due_date' => $due,
            'period_start' => substr($due, 0, 8).'01',
            'paid_at' => $payeLe === null ? null : Carbon::parse($payeLe, 'Africa/Dakar'),
        ]);
    }

    public function test_ac3_ac5_agency_overdue_is_the_unpaid_amount_at_each_month_end(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);
        $bail = Lease::factory()->active()->create(['agency_id' => $agency->id, 'monthly_rent' => 300_000]);

        // AC3 — 300 000 F dus début octobre, toujours impayés : dans le point d'octobre (et de novembre), pas avant.
        $this->echeance($bail, '2026-10-05', 300_000, PaymentStatus::Late);
        // AC5 — un loyer soldé dans son mois ne compte jamais.
        $this->echeance($bail, '2026-09-05', 100_000, PaymentStatus::Paid, '2026-09-20 12:00:00');
        // Dû en août, soldé le 10 octobre : impayé fin août et fin septembre, plus fin octobre.
        $this->echeance($bail, '2026-08-05', 80_000, PaymentStatus::Paid, '2026-10-10 12:00:00');
        // Une restitution de caution n'est jamais un impayé.
        $this->echeance($bail, '2026-09-01', 50_000, PaymentStatus::Pending, null, LeasePaymentType::DepositRefund);
        // Le voisin : une autre agence.
        $voisin = Lease::factory()->active()->create(['agency_id' => Agency::factory()->create()->id]);
        $this->echeance($voisin, '2026-10-05', 999_000, PaymentStatus::Late);

        $r = $this->apiGet('/api/dashboard/agency?include=timeseries&months=4')->assertOk();

        $this->assertSame(['2026-08', '2026-09', '2026-10', '2026-11'], $r->json('timeseries.months'));
        $this->assertEquals([80_000.0, 80_000.0, 300_000.0, 300_000.0], $r->json('timeseries.overdue'));
        // Le point du mois en cours est l'impayé du jour.
        $this->assertEquals($r->json('data.finance.overdue_amount'), $r->json('timeseries.overdue.3'));
    }

    public function test_ac4_owner_expected_is_the_sum_of_the_rents_due_in_the_month(): void
    {
        $owner = $this->apiActingAsRole('owner');
        $a = Lease::factory()->active()->create(['landlord_id' => $owner->id, 'monthly_rent' => 100_000]);
        $b = Lease::factory()->active()->create(['landlord_id' => $owner->id, 'monthly_rent' => 50_000]);
        $this->echeance($a, '2026-10-05', 100_000, PaymentStatus::Paid, '2026-10-06 12:00:00');
        $this->echeance($b, '2026-10-10', 50_000, PaymentStatus::Late);
        // Ni une échéance annulée, ni des charges : ce ne sont pas des loyers attendus.
        $this->echeance($b, '2026-10-12', 70_000, PaymentStatus::Cancelled);
        $this->echeance($a, '2026-10-15', 20_000, PaymentStatus::Pending, null, LeasePaymentType::Charges);
        $this->echeance($a, '2026-11-05', 100_000, PaymentStatus::Pending);
        $voisin = Lease::factory()->active()->create(['landlord_id' => User::factory()->create()->id]);
        $this->echeance($voisin, '2026-10-05', 888_000, PaymentStatus::Pending);

        $r = $this->apiGet('/api/dashboard/owner?include=timeseries&months=2')->assertOk();

        $this->assertSame(['2026-10', '2026-11'], $r->json('timeseries.months'));
        $this->assertEquals([150_000.0, 100_000.0], $r->json('timeseries.expected'));
        // L'encaissé d'octobre, en face.
        $this->assertEquals(100_000.0, $r->json('timeseries.cashflow.0'));
    }
}

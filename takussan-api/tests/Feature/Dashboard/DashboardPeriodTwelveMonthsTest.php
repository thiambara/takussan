<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\CommissionEntry;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\RentPeriod;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2865 — AC1 : `period=last_12_months` sur `/api/dashboard/agency`, `/agent` et `/owner` : les douze mois glissants
 * terminés au mois en cours (décembre 2025 → novembre 2026 un jour de novembre 2026). Les chiffres « du mois » valent
 * pour la période ENTIÈRE — un encaissement d'un mois du MILIEU (mars) compte, un de novembre 2025 non —, et toute
 * valeur hors de la liste reste un 422.
 */
class DashboardPeriodTwelveMonthsTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-11-13 10:00:00', 'Africa/Dakar'));
    }

    private function encaisse(Lease $lease, string $payeLe, int $montant): LeasePayment
    {
        return LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => $montant,
            'payment_type' => LeasePaymentType::Rent,
            'status' => PaymentStatus::Paid,
            'due_date' => substr($payeLe, 0, 10),
            'period_start' => substr($payeLe, 0, 8).'01',
            'paid_at' => Carbon::parse($payeLe, 'Africa/Dakar'),
        ]);
    }

    /** @return array{0: Agency, 1: User} */
    private function agenceEtSonAdmin(): array
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);

        return [$agency, $admin];
    }

    public function test_ac1_agency_twelve_months_cover_december_to_november_and_sum_them(): void
    {
        [$agency] = $this->agenceEtSonAdmin();
        $bail = Lease::factory()->active()->create(['agency_id' => $agency->id, 'monthly_rent' => 100_000, 'commission_amount' => 0]);
        $this->encaisse($bail, '2025-11-28 12:00:00', 1_000);   // hors période
        $this->encaisse($bail, '2025-12-01 09:00:00', 10_000);  // premier mois
        $this->encaisse($bail, '2026-03-15 12:00:00', 100_000); // un mois du milieu
        $this->encaisse($bail, '2026-11-05 12:00:00', 40_000);  // le mois en cours
        $voisin = Lease::factory()->active()->create(['agency_id' => Agency::factory()->create()->id]);
        $this->encaisse($voisin, '2026-03-10 12:00:00', 999_000);

        $r = $this->apiGet('/api/dashboard/agency?period=last_12_months')->assertOk();
        $r->assertJsonPath('data.period.key', 'last_12_months')
            ->assertJsonPath('data.period.start', '2025-12-01T00:00:00+00:00')
            ->assertJsonPath('data.period.end', '2026-11-30T23:59:59+00:00')
            ->assertJsonPath('data.period.months.0', '2025-12')
            ->assertJsonPath('data.period.months.11', '2026-11');
        $this->assertCount(12, $r->json('data.period.months'));
        $this->assertEquals(150_000.0, $r->json('data.finance.revenue_month'));
        $this->assertEquals(150_000.0, $r->json('data.finance.lease_income_month'));

        // Le mois en cours ne change pas : `months` ne liste que lui.
        $courant = $this->apiGet('/api/dashboard/agency')->assertOk();
        $courant->assertJsonPath('data.period.months', ['2026-11']);
        $this->assertEquals(40_000.0, $courant->json('data.finance.revenue_month'));

        // AC1 — régression gardée : hors de la liste, 422.
        $this->apiGet('/api/dashboard/agency?period=foo')->assertStatus(422)->assertJsonPath('code', 'dashboard.invalid_period');
    }

    public function test_agency_commission_follows_the_twelve_months(): void
    {
        [$agency] = $this->agenceEtSonAdmin();
        Lease::factory()->active()->create(['agency_id' => $agency->id, 'commission_amount' => 50_000, 'signed_at' => Carbon::parse('2026-04-20 12:00:00')]);
        Lease::factory()->active()->create(['agency_id' => $agency->id, 'commission_amount' => 9_000, 'signed_at' => Carbon::parse('2025-10-20 12:00:00')]);

        $this->assertEquals(50_000.0, $this->apiGet('/api/dashboard/agency?period=last_12_months')->assertOk()->json('data.finance.commission_month'));
    }

    public function test_agent_twelve_months_sum_his_commissions_and_keep_the_current_year(): void
    {
        $agency = Agency::factory()->create();
        $agent = $this->agencyAgent($agency);
        $ligne = fn (string $le, int $montant) => CommissionEntry::factory()->create([
            'agency_id' => $agency->id, 'beneficiary_id' => $agent->id, 'amount' => $montant, 'earned_at' => Carbon::parse($le),
        ]);
        $ligne('2025-11-12 12:00:00', 1_000);  // hors période
        $ligne('2025-12-12 12:00:00', 20_000); // période, année passée
        $ligne('2026-03-12 12:00:00', 30_000);
        $ligne('2026-11-02 12:00:00', 7_000);
        $this->actingAsApi($agent);

        $r = $this->getJson('/api/dashboard/agent?period=last_12_months')->assertOk();
        $r->assertJsonPath('data.period.key', 'last_12_months');
        $this->assertEquals(57_000.0, $r->json('data.finance.commissions_month'));
        // Le cumul de l'année : l'année EN COURS (2026), jamais depuis décembre 2025.
        $this->assertEquals(37_000.0, $r->json('data.finance.commissions_year'));

        $this->getJson('/api/dashboard/agent?period=foo')->assertStatus(422);
    }

    public function test_owner_twelve_months_count_his_rents_of_the_whole_period(): void
    {
        $owner = $this->apiActingAsRole('owner');
        $bail = Lease::factory()->active()->create(['landlord_id' => $owner->id, 'monthly_rent' => 100_000]);
        $this->encaisse($bail, '2025-11-05 12:00:00', 5_000);   // hors période
        $this->encaisse($bail, '2026-03-05 12:00:00', 100_000);
        $this->encaisse($bail, '2026-11-05 12:00:00', 60_000);
        $voisin = Lease::factory()->active()->create(['landlord_id' => User::factory()->create()->id]);
        $this->encaisse($voisin, '2026-03-05 12:00:00', 888_000);

        $r = $this->apiGet('/api/dashboard/owner?period=last_12_months')->assertOk();
        $r->assertJsonPath('data.period.key', 'last_12_months')
            ->assertJsonPath('data.finance.rent_month.expected_count', 2)
            ->assertJsonPath('data.finance.rent_month.received_count', 2);
        $this->assertEquals(160_000.0, $r->json('data.finance.cashflow_month'));
        $this->assertEquals(160_000.0, $r->json('data.finance.rent_month.received_amount'));

        $this->apiGet('/api/dashboard/owner?period=foo')->assertStatus(422);
    }

    /**
     * Sous douze mois, le reversé est la SOMME des mois, et la courte durée UNE mesure sur la période (nuitées ÷
     * capacité), jamais la moyenne des taux mensuels : un bien créé en novembre n'ajoute de capacité qu'à novembre.
     */
    public function test_owner_twelve_months_sum_the_payouts_and_pool_the_short_stay_occupancy(): void
    {
        $agency = Agency::factory()->create();
        $owner = $this->apiActingAsRole('owner', ['agency' => $agency]);
        $unite = fn (string $creeLe) => Property::factory()->create([
            'user_id' => $owner->id, 'agency_id' => $agency->id, 'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Daily, 'status' => PropertyStatus::Available, 'created_at' => $creeLe,
        ]);
        $ancienne = $unite('2025-01-01');
        $unite('2026-11-01');
        // Dix nuitées en octobre (fin exclue).
        Booking::factory()->create([
            'property_id' => $ancienne->id, 'agency_id' => $agency->id, 'status' => BookingStatus::Completed->value,
            'start_date' => '2026-10-01', 'end_date' => '2026-10-11',
        ]);
        foreach (['2025-11-12 10:00:00' => 9_000, '2026-03-12 10:00:00' => 50_000, '2026-11-02 10:00:00' => 20_000] as $le => $net) {
            Payout::factory()->create([
                'landlord_id' => $owner->id, 'agency_id' => $agency->id, 'payee_role' => PayeeRole::Landlord->value,
                'status' => PayoutStatus::Completed, 'gross_amount' => $net, 'commission_amount' => 0, 'net_amount' => $net,
                'processed_at' => $le,
            ]);
        }

        $r = $this->apiGet('/api/dashboard/owner?period=last_12_months')->assertOk();

        $this->assertEquals(70_000.0, $r->json('data.finance.net_paid_out_month'));
        // Capacité : 365 jours (l'ancienne, décembre → novembre) + 30 (la neuve, novembre) = 395 ; 10 ÷ 395 = 2,53 %.
        // La moyenne des taux mensuels (32,26 % en octobre, 0 ailleurs) rendrait 2,69.
        $this->assertEquals(2.53, $r->json('data.occupancy.short_stay_percent'));
    }
}

<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PayoutStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\RentPeriod;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Payout;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;
use Tests\Support\ReferencePortfolio;

/**
 * TCK-595 — AC1 à AC4 et AC8 : les chiffres du bailleur sur le jeu de référence R.
 *
 * Chaque valeur est comparée EN ENTIER : l'ancien test ne vérifiait que la longueur de la série, et
 * janvier y valait 0 pour un bail terminé en juin sans que rien ne rougisse.
 */
class DashboardOwnerMetricsTest extends ApiTestCase
{
    use ReferencePortfolio;
    use RefreshDatabase;

    /** @return array{agency: Agency, owner: User, properties: array<string, Property>, leases: array<string, Lease>} */
    private function referenceAsOwner(): array
    {
        Carbon::setTestNow('2026-07-15 00:00:00');
        $agency = Agency::factory()->create();
        $owner = $this->apiActingAsRole('owner', ['agency' => $agency]);

        return $this->buildReferencePortfolio($owner, $agency);
    }

    public function test_ac1_occupancy_series_reads_lease_dates_not_current_status(): void
    {
        $this->referenceAsOwner();

        $ts = $this->apiGet('/api/dashboard/owner?include=timeseries&months=7')->assertOk()->json('timeseries');

        $this->assertSame(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'], $ts['months']);
        $this->assertEquals([66.67, 66.67, 84.95, 77.78, 66.67, 66.67, 33.33], $ts['occupancy']);
    }

    public function test_ac1_a_second_lease_on_the_same_unit_does_not_count_its_days_twice(): void
    {
        $ref = $this->referenceAsOwner();
        Lease::factory()->create([
            'property_id' => $ref['properties']['L2']->id,
            'landlord_id' => $ref['owner']->id,
            'agency_id' => $ref['agency']->id,
            'status' => LeaseStatus::Active,
            'start_date' => '2026-07-01',
            'end_date' => '2026-07-31',
        ]);

        $ts = $this->apiGet('/api/dashboard/owner?include=timeseries&months=7')->assertOk()->json('timeseries');

        $this->assertEquals(33.33, $ts['occupancy'][6]);
    }

    public function test_ac2_denominator_counts_only_eligible_leaf_units(): void
    {
        $ref = $this->referenceAsOwner();

        $this->assertEquals(33.33, $this->apiGet('/api/dashboard/owner')->assertOk()->json('data.occupancy.rate_percent'));

        $extra = ['user_id' => $ref['owner']->id, 'agency_id' => $ref['agency']->id, 'created_at' => '2025-12-01'];
        Property::factory()->create($extra + ['contract_type' => ContractType::Sale, 'rent_period' => null]);
        Property::factory()->create($extra + ['contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly, 'status' => PropertyStatus::Draft]);
        $parent = Property::factory()->create($extra + ['contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly]);
        Property::factory()->create(['parent_id' => $parent->id, 'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly, 'status' => PropertyStatus::Draft] + $extra);

        $this->assertEquals(33.33, $this->apiGet('/api/dashboard/owner')->assertOk()->json('data.occupancy.rate_percent'));

        Property::factory()->create($extra + ['contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly]);

        $this->assertEquals(25.0, $this->apiGet('/api/dashboard/owner')->assertOk()->json('data.occupancy.rate_percent'));
    }

    /**
     * P93.01 (TCK-1173) — un mois passé garde le bien qu'un bail y couvrait, quel que soit le statut
     * ou le type de contrat d'aujourd'hui : archiver ou vendre ne réécrit pas l'occupation de janvier.
     * Le mois en cours garde l'exclusion par statut courant.
     */
    public function test_p93_01_past_months_keep_a_leased_unit_archived_or_sold_today(): void
    {
        Carbon::setTestNow('2026-07-15 00:00:00');
        $agency = Agency::factory()->create();
        $owner = $this->apiActingAsRole('owner', ['agency' => $agency]);
        $unit = Property::factory()->create([
            'user_id' => $owner->id,
            'agency_id' => $agency->id,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Monthly,
            'status' => PropertyStatus::Available,
            'created_at' => '2025-12-01',
        ]);
        Lease::factory()->create([
            'property_id' => $unit->id,
            'landlord_id' => $owner->id,
            'agency_id' => $agency->id,
            'status' => LeaseStatus::Expired,
            'start_date' => '2026-01-01',
            'end_date' => '2026-06-30',
        ]);
        $series = fn (): array => $this->apiGet('/api/dashboard/owner?include=timeseries&months=7')->assertOk()->json('timeseries.occupancy');

        $this->assertEquals([100, 100, 100, 100, 100, 100, 0], $series());

        $unit->forceFill(['status' => PropertyStatus::Archived])->save();
        $this->assertEquals([100, 100, 100, 100, 100, 100, 0], $series(), 'archivé aujourd\'hui');

        $unit->forceFill(['status' => PropertyStatus::Available, 'contract_type' => ContractType::Sale])->save();
        $this->assertEquals([100, 100, 100, 100, 100, 100, 0], $series(), 'passé en vente aujourd\'hui');
    }

    /** P93.01 (TCK-1173) — même règle pour la courte durée : les nuitées d'un mois passé restent. */
    public function test_p93_01_past_short_stay_months_keep_a_booked_unit_archived_today(): void
    {
        Carbon::setTestNow('2026-07-15 00:00:00');
        $agency = Agency::factory()->create();
        $owner = $this->apiActingAsRole('owner', ['agency' => $agency]);
        $unit = Property::factory()->create([
            'user_id' => $owner->id,
            'agency_id' => $agency->id,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Daily,
            'status' => PropertyStatus::Available,
            'created_at' => '2025-12-01',
        ]);
        Booking::factory()->create([
            'property_id' => $unit->id,
            'agency_id' => $agency->id,
            'status' => BookingStatus::Completed->value,
            'start_date' => '2026-06-01',
            'end_date' => '2026-06-16',
        ]);
        $june = fn (): mixed => $this->apiGet('/api/dashboard/owner?include=timeseries&months=7')->assertOk()->json('timeseries.short_stay_occupancy.5');

        $this->assertEquals(50.0, $june());

        $unit->forceFill(['status' => PropertyStatus::Archived])->save();
        $this->assertEquals(50.0, $june(), 'archivé aujourd\'hui');
    }

    public function test_ac3_short_stay_counts_nights_of_confirmed_bookings_only(): void
    {
        $this->referenceAsOwner();

        $this->assertEquals(16.13, $this->apiGet('/api/dashboard/owner')->assertOk()->json('data.occupancy.short_stay_percent'));
    }

    public function test_ac4_cashflow_overdue_net_and_deposits(): void
    {
        $this->referenceAsOwner();

        $finance = $this->apiGet('/api/dashboard/owner')->assertOk()->json('data.finance');

        $this->assertEquals(210000.0, $finance['cashflow_month']);
        $this->assertEquals(150000.0, $finance['lease_income_month']);
        $this->assertEquals(60000.0, $finance['booking_income_month']);
        $this->assertEquals(135000.0, $finance['net_paid_out_month']);
        $this->assertEquals(200000.0, $finance['deposits_held']);
        $this->assertSame(1, $finance['overdue_count']);
        $this->assertEquals(50000.0, $finance['overdue_amount']);
    }

    public function test_ac4_net_paid_out_reads_only_payouts_to_the_landlord(): void
    {
        $ref = $this->referenceAsOwner();
        foreach ([[100_000, PayeeRole::Tenant], [60_000, PayeeRole::ServiceProvider]] as [$net, $role]) {
            Payout::factory()->create([
                'landlord_id' => $ref['owner']->id,
                'agency_id' => $ref['agency']->id,
                'payee_role' => $role->value,
                'status' => PayoutStatus::Completed,
                'gross_amount' => $net,
                'commission_amount' => 0,
                'net_amount' => $net,
                'processed_at' => '2026-07-12 10:00:00',
            ]);
        }

        $this->assertEquals(135000.0, $this->apiGet('/api/dashboard/owner')->assertOk()->json('data.finance.net_paid_out_month'));
    }

    public function test_ac5_the_agency_dashboard_applies_the_same_rules(): void
    {
        Carbon::setTestNow('2026-07-15 00:00:00');
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $this->buildReferencePortfolio(null, $agency);
        $this->actingAsApi($admin);

        $data = $this->apiGet('/api/dashboard/agency')->assertOk()->json('data');

        $this->assertEquals(33.33, $data['occupancy']['rate_percent']);
        $this->assertEquals(16.13, $data['occupancy']['short_stay_percent']);
        $this->assertEquals(210000.0, $data['finance']['revenue_month']);
        $this->assertEquals(60000.0, $data['finance']['booking_income_month']);
        $this->assertEquals(135000.0, $data['finance']['net_paid_out_month']);
        $this->assertEquals(200000.0, $data['finance']['deposits_held']);
        $this->assertSame(1, $data['finance']['overdue_count']);
        $this->assertEquals(50000.0, $data['finance']['overdue_amount']);
        // 50 000 d'impayé sur 150 000 de loyers actifs attendus (L2).
        $this->assertEquals(33.33, $data['finance']['unpaid_rate_percent']);

        $ts = $this->apiGet('/api/dashboard/agency?include=timeseries&months=7')->assertOk()->json('timeseries');
        $this->assertEquals([66.67, 66.67, 84.95, 77.78, 66.67, 66.67, 33.33], $ts['occupancy']);
    }

    public function test_ac8_actionable_cards_count_only_the_landlords_own_properties(): void
    {
        $ref = $this->referenceAsOwner();
        $other = Property::factory()->create(['agency_id' => $ref['agency']->id]);

        foreach ([$ref['properties']['L2'], $other] as $property) {
            MaintenanceRequest::factory()->count(2)->create(['property_id' => $property->id, 'status' => MaintenanceStatus::QuoteSubmitted]);
            PropertyVisit::factory()->create(['property_id' => $property->id, 'status' => VisitStatus::Scheduled, 'scheduled_at' => now()->addDays(2)]);
            Review::factory()->create([
                'reviewable_type' => Property::class,
                'reviewable_id' => $property->id,
                'is_approved' => true,
                'reply_content' => null,
            ]);
        }
        // Témoins qui ne comptent pas : une visite passée, un avis déjà répondu, un avis non approuvé.
        PropertyVisit::factory()->create(['property_id' => $ref['properties']['L2']->id, 'status' => VisitStatus::Scheduled, 'scheduled_at' => now()->subDay()]);
        Review::factory()->create(['reviewable_type' => Property::class, 'reviewable_id' => $ref['properties']['L2']->id, 'is_approved' => true, 'reply_content' => 'Merci']);
        Review::factory()->create(['reviewable_type' => Property::class, 'reviewable_id' => $ref['properties']['L2']->id, 'is_approved' => false, 'reply_content' => null]);

        $data = $this->apiGet('/api/dashboard/owner')->assertOk()->json('data');

        $this->assertSame(2, $data['maintenance']['quotes_pending']);
        $this->assertSame(1, $data['visits']['to_confirm']);
        $this->assertSame(1, $data['reviews']['unanswered']);
    }
}

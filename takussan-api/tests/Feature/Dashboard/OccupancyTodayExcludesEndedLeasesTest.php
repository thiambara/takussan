<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Enums\ContractType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\RentPeriod;
use App\Models\Lease;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;

/**
 * TCK-2626 — AC2 et AC3 : l'occupation du JOUR ne compte que les baux `active` et `terminating`
 * (`Lease::ONGOING_STATUSES`), comme « Baux actifs ». Un bail résilié sans `terminated_at`, ou
 * expiré avant son `end_date`, n'occupe plus son bien aujourd'hui ; il a bien occupé les mois d'avant,
 * et la série mensuelle passée garde sa règle (TCK-1173). Le bailleur et l'agence lisent la même mesure.
 */
class OccupancyTodayExcludesEndedLeasesTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    /** @var list<Lease> */
    private array $leases = [];

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-15 10:00:00');
        $this->agency = Agency::factory()->create();
    }

    public function test_ac2_a_terminated_lease_without_terminated_at_no_longer_occupies_today(): void
    {
        $owner = $this->apiActingAsRole('owner', ['agency' => $this->agency]);
        $this->fiveLeasedUnits($owner->id);
        $this->assertToday('/api/dashboard/owner', 100, 5, 5);

        $this->leases[0]->update([
            'status' => LeaseStatus::Terminated, 'terminated_at' => null, 'end_date' => now()->addMonths(6)->toDateString(),
        ]);

        $this->assertToday('/api/dashboard/owner', 80, 5, 4);
        $series = $this->apiGet('/api/dashboard/owner?include=timeseries&months=2')->assertOk()->json('timeseries');
        $this->assertSame(['2026-10', '2026-11'], $series['months']);
        $this->assertEquals(100, $series['occupancy'][0], 'le mois précédent garde sa règle (TCK-1173)');
    }

    public function test_an_expired_lease_with_an_end_date_still_ahead_no_longer_occupies_today(): void
    {
        $owner = $this->apiActingAsRole('owner', ['agency' => $this->agency]);
        $this->fiveLeasedUnits($owner->id);

        $this->leases[1]->update(['status' => LeaseStatus::Expired, 'end_date' => now()->addMonth()->toDateString()]);

        $this->assertToday('/api/dashboard/owner', 80, 5, 4);
    }

    public function test_a_lease_under_notice_still_occupies_today(): void
    {
        $owner = $this->apiActingAsRole('owner', ['agency' => $this->agency]);
        $this->fiveLeasedUnits($owner->id);

        $this->leases[2]->update(['status' => LeaseStatus::Terminating, 'end_date' => now()->addMonth()->toDateString()]);

        $this->assertToday('/api/dashboard/owner', 100, 5, 5);
    }

    public function test_ac2_the_agency_view_reads_the_same_measure(): void
    {
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);
        $this->agency->update(['primary_admin_id' => $admin->id]);
        $this->fiveLeasedUnits(null);

        $this->assertToday('/api/dashboard/agency', 100, 5, 5);

        $this->leases[0]->update([
            'status' => LeaseStatus::Terminated, 'terminated_at' => null, 'end_date' => now()->addMonths(6)->toDateString(),
        ]);

        $this->assertToday('/api/dashboard/agency', 80, 5, 4);
    }

    private function assertToday(string $endpoint, float $rate, int $eligible, int $occupied): void
    {
        $o = $this->apiGet($endpoint)->assertOk()->json('data.occupancy');

        $this->assertEquals($rate, $o['rate_percent']);
        $this->assertSame($eligible, $o['eligible_count']);
        $this->assertSame($occupied, $o['occupied_count']);
    }

    private function fiveLeasedUnits(?int $ownerId): void
    {
        foreach (range(1, 5) as $_) {
            $unit = Property::factory()->create(array_filter(['user_id' => $ownerId]) + [
                'agency_id' => $this->agency->id,
                'created_at' => '2025-12-01',
                'contract_type' => ContractType::Rent,
                'rent_period' => RentPeriod::Monthly,
                'status' => PropertyStatus::Rented,
            ]);
            $this->leases[] = Lease::factory()->create([
                'property_id' => $unit->id,
                'landlord_id' => $unit->user_id,
                'agency_id' => $this->agency->id,
                'status' => LeaseStatus::Active,
                'start_date' => '2026-01-01',
                'end_date' => null,
                'terminated_at' => null,
            ]);
        }
    }
}

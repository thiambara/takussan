<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Enums\ContractType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\RentPeriod;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;

/**
 * TCK-2626 — AC1 : l'occupation du bailleur rend sa base. « 54 disponibles » et « 100 % » sur le
 * même écran ne se contredisent plus quand le taux dit sur combien de biens il se calcule.
 */
class OwnerOccupancyBaseTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_ac1_five_leased_monthly_units_and_three_for_sale_give_a_base_of_five(): void
    {
        Carbon::setTestNow('2026-11-15 10:00:00');
        $agency = Agency::factory()->create();
        $owner = $this->apiActingAsRole('owner', ['agency' => $agency]);
        $this->portfolio($owner, $agency);

        $data = $this->apiGet('/api/dashboard/owner')->assertOk()->json('data');

        $this->assertEquals(100, $data['occupancy']['rate_percent']);
        $this->assertSame(5, $data['occupancy']['eligible_count']);
        $this->assertSame(5, $data['occupancy']['occupied_count']);
        $this->assertSame(3, $data['portfolio']['available']);
        $this->assertSame(8, $data['portfolio']['total']);
        $this->assertArrayHasKey('short_stay_percent', $data['occupancy']);
    }

    public function test_the_base_is_zero_and_the_rate_null_without_any_eligible_unit(): void
    {
        Carbon::setTestNow('2026-11-15 10:00:00');
        $agency = Agency::factory()->create();
        $owner = $this->apiActingAsRole('owner', ['agency' => $agency]);
        Property::factory()->create([
            'user_id' => $owner->id, 'agency_id' => $agency->id, 'created_at' => '2025-12-01',
            'contract_type' => ContractType::Sale, 'rent_period' => null, 'status' => PropertyStatus::Available,
        ]);

        $occupancy = $this->apiGet('/api/dashboard/owner')->assertOk()->json('data.occupancy');

        $this->assertNull($occupancy['rate_percent']);
        $this->assertSame(0, $occupancy['eligible_count']);
        $this->assertSame(0, $occupancy['occupied_count']);
    }

    /** @return list<Lease> les cinq baux, dans l'ordre des biens */
    private function portfolio(User $owner, Agency $agency): array
    {
        $base = ['user_id' => $owner->id, 'agency_id' => $agency->id, 'created_at' => '2025-12-01'];
        $leases = [];
        foreach (range(1, 5) as $_) {
            $unit = Property::factory()->create($base + [
                'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly, 'status' => PropertyStatus::Rented,
            ]);
            $leases[] = Lease::factory()->create([
                'property_id' => $unit->id, 'landlord_id' => $owner->id, 'agency_id' => $agency->id,
                'status' => LeaseStatus::Active, 'start_date' => '2026-01-01', 'end_date' => null, 'terminated_at' => null,
            ]);
        }
        Property::factory()->count(3)->create($base + [
            'contract_type' => ContractType::Sale, 'rent_period' => null, 'status' => PropertyStatus::Available,
        ]);

        return $leases;
    }
}

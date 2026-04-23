<?php

namespace Tests\Feature\Dashboard;

use App\Models\Customer;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * Tests for GET /api/dashboard/owner (TCK-032 P1).
 */
class DashboardOwnerTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_owner_receives_portfolio_summary(): void
    {
        $owner = $this->apiActingAsRole('owner');

        Property::factory()->count(2)->create(['user_id' => $owner->id]);

        $lease = Lease::factory()->active()->create([
            'landlord_id' => $owner->id,
            'monthly_rent' => 120_000,
        ]);
        $customer = Customer::factory()->create();
        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $customer->id,
            'amount' => 120_000,
            'status' => PaymentStatus::Paid,
            'paid_at' => now(),
        ]);

        $response = $this->apiGet('/api/dashboard/owner')->assertOk();

        $response->assertJsonStructure([
            'data' => [
                'owner_id',
                'period' => ['start', 'end'],
                'portfolio' => ['total', 'rented', 'available'],
                'leases' => ['active'],
                'bookings' => ['pending'],
                'finance' => ['cashflow_month', 'expected_monthly', 'overdue_count', 'overdue_amount'],
                'occupancy' => ['rate_percent'],
            ],
        ]);

        $this->assertSame($owner->id, $response->json('data.owner_id'));
        $this->assertSame(2, $response->json('data.portfolio.total'));
        $this->assertEquals(120_000.0, $response->json('data.finance.cashflow_month'));
    }

    public function test_other_owners_leases_are_excluded(): void
    {
        $owner = $this->apiActingAsRole('owner');
        $otherOwner = User::factory()->create();

        Lease::factory()->active()->create([
            'landlord_id' => $otherOwner->id,
            'monthly_rent' => 500_000,
        ]);

        $data = $this->apiGet('/api/dashboard/owner')->assertOk()->json('data');

        $this->assertSame(0, $data['leases']['active']);
        $this->assertEquals(0.0, $data['finance']['expected_monthly']);
    }

    public function test_non_owner_without_admin_is_denied(): void
    {
        $this->apiActingAsRole('customer');
        $this->apiGet('/api/dashboard/owner')->assertForbidden();
    }

    public function test_unauthenticated_is_rejected(): void
    {
        $this->apiGet('/api/dashboard/owner')->assertUnauthorized();
    }

    public function test_timeseries_is_included_on_demand(): void
    {
        $this->apiActingAsRole('owner');

        $response = $this->apiGet('/api/dashboard/owner?include=timeseries&months=12')->assertOk();

        $this->assertCount(12, $response->json('timeseries.months'));
        $this->assertCount(12, $response->json('timeseries.cashflow'));
        $this->assertCount(12, $response->json('timeseries.occupancy'));
    }
}

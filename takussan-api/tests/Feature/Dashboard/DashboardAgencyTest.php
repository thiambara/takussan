<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * Tests for GET /api/dashboard/agency (TCK-032 P1).
 */
class DashboardAgencyTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_primary_admin_receives_agency_summary(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);

        Property::factory()->count(3)->create(['agency_id' => $agency->id]);
        Lease::factory()->active()->create([
            'agency_id' => $agency->id,
            'monthly_rent' => 150_000,
            'commission_amount' => 50_000,
            'signed_at' => now(),
        ]);

        $response = $this->apiGet('/api/dashboard/agency')->assertOk();

        $response->assertJsonStructure([
            'data' => [
                'agency_id',
                'period' => ['start', 'end'],
                'properties' => ['total', 'rented', 'available', 'published'],
                'leases' => ['active'],
                'customers_count',
                'members_count',
                'bookings' => ['pending'],
                'maintenance' => ['open'],
                'finance' => [
                    'revenue_month',
                    'commission_month',
                    'overdue_count',
                    'overdue_amount',
                    'unpaid_rate_percent',
                ],
                'occupancy' => ['rate_percent'],
            ],
        ]);

        $this->assertSame($agency->id, $response->json('data.agency_id'));
        $this->assertSame(3, $response->json('data.properties.total'));
        $this->assertSame(1, $response->json('data.leases.active'));
    }

    public function test_user_from_different_agency_is_denied(): void
    {
        $agency = Agency::factory()->create();
        $other = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->apiGet('/api/dashboard/agency?agency_id='.$other->id)->assertForbidden();
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        $this->apiGet('/api/dashboard/agency')->assertUnauthorized();
    }

    public function test_finance_summary_computes_revenue_and_overdue(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);

        $lease = Lease::factory()->active()->create([
            'agency_id' => $agency->id,
            'monthly_rent' => 200_000,
        ]);
        $customer = Customer::factory()->create(['agency_id' => $agency->id]);

        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $customer->id,
            'amount' => 100_000,
            'status' => PaymentStatus::Paid,
            'paid_at' => now(),
            'due_date' => now()->toDateString(),
        ]);
        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $customer->id,
            'amount' => 100_000,
            'status' => PaymentStatus::Late,
            'paid_at' => null,
            'due_date' => now()->subDays(5)->toDateString(),
        ]);

        $data = $this->apiGet('/api/dashboard/agency')->assertOk()->json('data');

        $this->assertEquals(100_000.0, $data['finance']['revenue_month']);
        $this->assertSame(1, $data['finance']['overdue_count']);
        $this->assertEquals(100_000.0, $data['finance']['overdue_amount']);
        $this->assertGreaterThan(0, $data['finance']['unpaid_rate_percent']);
    }

    public function test_timeseries_returned_when_requested(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);

        $response = $this->apiGet('/api/dashboard/agency?include=timeseries&months=6')->assertOk();

        $this->assertCount(6, $response->json('timeseries.months'));
        $this->assertCount(6, $response->json('timeseries.revenue'));
        $this->assertCount(6, $response->json('timeseries.occupancy'));
    }

    public function test_sparse_fields_filter_sections(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);

        $data = $this->apiGet('/api/dashboard/agency?fields[summary]=finance,occupancy')
            ->assertOk()
            ->json('data');

        $this->assertArrayHasKey('finance', $data);
        $this->assertArrayHasKey('occupancy', $data);
        $this->assertArrayHasKey('agency_id', $data); // always present
        $this->assertArrayNotHasKey('properties', $data);
    }
}

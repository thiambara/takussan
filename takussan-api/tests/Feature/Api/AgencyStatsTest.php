<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * Tests for GET /api/agencies/{agency}/stats (TCK-015 P1).
 */
class AgencyStatsTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_primary_admin_can_view_agency_stats(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);

        // Seed some data attached to this agency.
        Property::factory()->count(3)->create(['agency_id' => $agency->id]);
        Property::factory()->count(2)->create(['agency_id' => null]); // noise — different agency
        User::factory()->count(2)->create(['agency_id' => $agency->id]);
        Customer::factory()->count(4)->create(['agency_id' => $agency->id]);

        // 2 active leases this month — commissions 100_000 + 250_000.
        Lease::factory()->active()->create([
            'agency_id' => $agency->id,
            'commission_amount' => 100_000,
            'signed_at' => now(),
        ]);
        Lease::factory()->active()->create([
            'agency_id' => $agency->id,
            'commission_amount' => 250_000,
            'signed_at' => now(),
        ]);
        // Inactive lease outside the month — should not contribute.
        Lease::factory()->create([
            'agency_id' => $agency->id,
            'status' => LeaseStatus::Draft,
            'commission_amount' => 999_999,
            'signed_at' => now()->subMonths(3),
            'created_at' => now()->subMonths(3),
        ]);

        $response = $this->apiGet("/api/agencies/{$agency->id}/stats")
            ->assertOk();

        $data = $response->json('data');
        $this->assertSame($agency->id, $data['agency_id']);
        $this->assertSame(3, $data['properties_count']);
        // Members: primary admin + 2 seeded members = 3.
        $this->assertSame(3, $data['members_count']);
        $this->assertSame(4, $data['customers_count']);
        $this->assertSame(2, $data['active_leases_count']);
        $this->assertEqualsWithDelta(350_000, $data['commission_month'], 0.01);
    }

    public function test_super_admin_can_view_any_agency_stats(): void
    {
        $this->apiActingAsRole('super_admin');
        $agency = Agency::factory()->create();

        $this->apiGet("/api/agencies/{$agency->id}/stats")
            ->assertOk();
    }

    public function test_agency_admin_cannot_view_stats_of_another_agency(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agencyA]);

        $this->apiGet("/api/agencies/{$agencyB->id}/stats")
            ->assertForbidden();
    }

    public function test_regular_agent_cannot_view_stats(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agent', ['agency' => $agency]);

        $this->apiGet("/api/agencies/{$agency->id}/stats")
            ->assertForbidden();
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        $agency = Agency::factory()->create();

        $this->getJson("/api/agencies/{$agency->id}/stats")
            ->assertUnauthorized();
    }
}

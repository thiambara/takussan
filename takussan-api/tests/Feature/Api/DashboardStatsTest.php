<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class DashboardStatsTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_user_scoped_stats(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $user->id]);
        Booking::factory()->count(2)->create([
            'property_id' => $property->id,
            'status' => BookingStatus::Pending,
        ]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/dashboard/stats');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    'properties_count',
                    'active_leases',
                    'pending_bookings',
                    'overdue_payments',
                ],
            ]);
    }

    public function test_super_admin_stats(): void
    {
        $dummyAgency = Agency::factory()->create();
        Role::create(['name' => 'super_admin', 'team_id' => $dummyAgency->id]);
        setPermissionsTeamId($dummyAgency->id);

        $admin = User::factory()->create(['agency_id' => $dummyAgency->id]);
        $admin->assignRole('super_admin');
        Sanctum::actingAs($admin);

        $this->getJson('/api/dashboard/stats')->assertOk()
            ->assertJsonStructure(['data' => ['properties_count', 'open_maintenance']]);
    }

    public function test_agency_admin_stats(): void
    {
        $agency = Agency::factory()->create();
        Role::create(['name' => 'agency_admin', 'team_id' => $agency->id]);
        setPermissionsTeamId($agency->id);

        $admin = User::factory()->create(['agency_id' => $agency->id]);
        $admin->assignRole('agency_admin');
        Sanctum::actingAs($admin);

        $this->getJson('/api/dashboard/stats')->assertOk()
            ->assertJsonStructure(['data' => ['properties_count', 'customers_count']]);
    }

    public function test_agent_stats(): void
    {
        $agency = Agency::factory()->create();
        Role::create(['name' => 'agent', 'team_id' => $agency->id]);
        setPermissionsTeamId($agency->id);

        $agent = User::factory()->create(['agency_id' => $agency->id]);
        $agent->assignRole('agent');
        Sanctum::actingAs($agent);

        $this->getJson('/api/dashboard/stats')->assertOk()
            ->assertJsonStructure(['data' => ['properties_count', 'open_maintenance']]);
    }

    public function test_tenant_stats(): void
    {
        $dummyAgency = Agency::factory()->create();
        Role::create(['name' => 'tenant', 'team_id' => $dummyAgency->id]);
        setPermissionsTeamId($dummyAgency->id);

        $tenantUser = User::factory()->create(['agency_id' => $dummyAgency->id]);
        $tenantUser->assignRole('tenant');
        $customer = Customer::factory()->create(['user_id' => $tenantUser->id]);
        Sanctum::actingAs($tenantUser);

        $this->getJson('/api/dashboard/stats')->assertOk()
            ->assertJsonStructure(['data' => ['active_lease', 'overdue_payments']]);
    }
}

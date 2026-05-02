<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
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
        // TCK-144 — super_admin is a *global* role, always assigned under
        // team_id=null. Probing it under any other team is non-canonical
        // and the new `User::isSuperAdmin()` helper enforces team-null.
        Role::create(['name' => 'super_admin', 'team_id' => null]);
        setPermissionsTeamId(null);

        $admin = User::factory()->create();
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

    public function test_tenant_stats_counts_open_maintenance_by_requester(): void
    {
        $dummyAgency = Agency::factory()->create();
        Role::create(['name' => 'tenant', 'team_id' => $dummyAgency->id]);
        setPermissionsTeamId($dummyAgency->id);

        $tenantUser = User::factory()->create(['agency_id' => $dummyAgency->id]);
        $tenantUser->assignRole('tenant');
        Customer::factory()->create(['user_id' => $tenantUser->id]);

        $property = Property::factory()->create();
        MaintenanceRequest::factory()->count(2)->create([
            'property_id' => $property->id,
            'requester_id' => $tenantUser->id,
            'status' => MaintenanceStatus::Open,
        ]);
        MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => $tenantUser->id,
            'status' => MaintenanceStatus::Completed,
        ]);
        MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
            'status' => MaintenanceStatus::Open,
        ]);

        Sanctum::actingAs($tenantUser);

        $this->getJson('/api/dashboard/stats')->assertOk()
            ->assertJsonPath('data.open_maintenance', 2);
    }
}

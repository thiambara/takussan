<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\PermissionRegistrar;
use Tests\ApiTestCase;

/**
 * Tests for GET /api/dashboard/me — adaptive entry resolving role + payload (TCK-032 P1).
 */
class DashboardMeTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_returns_401_when_unauthenticated(): void
    {
        $this->apiGet('/api/dashboard/me')->assertUnauthorized();
    }

    public function test_returns_404_when_no_profile_resolves(): void
    {
        $this->ensureRolesSeeded();
        $user = User::factory()->create();
        $this->actingAs($user, 'sanctum');

        $response = $this->apiGet('/api/dashboard/me')->assertNotFound();
        $this->assertSame(
            'Aucun profil tableau de bord résolu pour cet utilisateur.',
            $response->json('message'),
        );
    }

    public function test_super_admin_with_agency_resolves_to_agency(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('super_admin', ['agency' => $agency]);

        $data = $this->apiGet('/api/dashboard/me')->assertOk()->json('data');

        $this->assertSame('agency_admin', $data['role']);
        $this->assertIsArray($data['metrics']);
        $this->assertContains('portfolio', $data['sections']);
    }

    public function test_agency_admin_resolves_to_agency_and_scoped_to_own_agency(): void
    {
        $agency = Agency::factory()->create();
        $other = Agency::factory()->create();

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        Property::factory()->count(3)->create(['agency_id' => $agency->id]);
        Property::factory()->count(5)->create(['agency_id' => $other->id]);

        $data = $this->apiGet('/api/dashboard/me')->assertOk()->json('data');

        $this->assertSame('agency_admin', $data['role']);
        $this->assertSame(3, $data['metrics']['properties_total']);
    }

    public function test_agent_with_agency_resolves_to_agent(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agent', ['agency' => $agency]);

        $data = $this->apiGet('/api/dashboard/me')->assertOk()->json('data');

        $this->assertSame('agent', $data['role']);
        $this->assertArrayHasKey('pipeline_total', $data['metrics']);
        $this->assertArrayHasKey('tasks_open', $data['metrics']);
        $this->assertContains('pipeline', $data['sections']);
    }

    public function test_owner_role_resolves_to_owner(): void
    {
        $owner = $this->apiActingAsRole('owner');
        Property::factory()->count(2)->create(['user_id' => $owner->id]);

        $data = $this->apiGet('/api/dashboard/me')->assertOk()->json('data');

        $this->assertSame('owner', $data['role']);
        $this->assertSame(2, $data['metrics']['portfolio_total']);
    }

    public function test_user_with_only_properties_resolves_to_owner(): void
    {
        $this->ensureRolesSeeded();
        $user = User::factory()->create();
        $this->actingAs($user, 'sanctum');

        Property::factory()->create(['user_id' => $user->id]);

        $data = $this->apiGet('/api/dashboard/me')->assertOk()->json('data');
        $this->assertSame('owner', $data['role']);
    }

    public function test_customer_role_resolves_to_tenant(): void
    {
        $user = $this->apiActingAsRole('customer');
        Customer::factory()->create(['user_id' => $user->id]);

        $data = $this->apiGet('/api/dashboard/me')->assertOk()->json('data');

        $this->assertSame('tenant', $data['role']);
        $this->assertContains('lease', $data['sections']);
    }

    public function test_priority_agent_wins_over_owner_when_user_has_both(): void
    {
        $agency = Agency::factory()->create();
        $user = $this->apiActingAsRole('agent', ['agency' => $agency]);

        // Add owner role + a property to the same user — agent should still win.
        app(PermissionRegistrar::class)->setPermissionsTeamId($user->agency_id);
        $user->assignRole('owner');
        Property::factory()->create(['user_id' => $user->id]);

        $data = $this->apiGet('/api/dashboard/me')->assertOk()->json('data');
        $this->assertSame('agent', $data['role']);
    }

    public function test_response_shape_matches_contract(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->apiGet('/api/dashboard/me')->assertOk()->assertJsonStructure([
            'data' => [
                'role',
                'metrics',
                'sections',
            ],
        ]);
    }

    public function test_super_admin_without_agency_does_not_resolve_to_agency(): void
    {
        $this->ensureRolesSeeded();
        $user = User::factory()->create(['agency_id' => null]);
        app(PermissionRegistrar::class)->setPermissionsTeamId(null);
        $user->assignRole('super_admin');
        $this->actingAs($user, 'sanctum');

        // No properties, no customer profile → 404 (frontend renders NoAgencyState).
        $this->apiGet('/api/dashboard/me')->assertNotFound();
    }

    public function test_lease_existing_tenant_with_payments_returns_metrics(): void
    {
        $user = $this->apiActingAsRole('customer');
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        Lease::factory()->active()->create(['tenant_id' => $customer->id]);

        $data = $this->apiGet('/api/dashboard/me')->assertOk()->json('data');

        $this->assertSame('tenant', $data['role']);
        $this->assertTrue($data['metrics']['has_customer_profile']);
        $this->assertSame(1, $data['metrics']['leases_active']);
    }
}

<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * Tests for the dedicated PUT /api/users/{user}/role endpoint (TCK-014).
 *
 * Separate from UserAdminController — this endpoint is the single source of
 * truth for replacing a user's role (syncRoles, not additive assignRole).
 */
class UserRoleControllerTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_super_admin_can_set_user_role(): void
    {
        $this->apiActingAsRole('super_admin');

        $target = User::factory()->create([
            'agency_id' => Agency::factory()->create()->id,
        ]);

        $response = $this->apiPut("/api/users/{$target->id}/role", ['role' => 'agent'])
            ->assertOk();

        $this->assertSame('agent', $response->json('data.role'));
        $this->assertContains('agent', $response->json('data.roles'));
    }

    public function test_agency_admin_can_set_role_for_user_in_own_agency(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $target = User::factory()->create(['agency_id' => $agency->id]);

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'agent'])
            ->assertOk();

        $this->assertTrue($target->fresh()->hasRole('agent'));
        $this->assertNotNull($admin);
    }

    public function test_agency_admin_cannot_set_role_for_user_in_another_agency(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agencyA]);
        $target = User::factory()->create(['agency_id' => $agencyB->id]);

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'agent'])
            ->assertForbidden();
    }

    public function test_agent_cannot_assign_roles(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agent', ['agency' => $agency]);
        $target = User::factory()->create(['agency_id' => $agency->id]);

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'customer'])
            ->assertForbidden();
    }

    public function test_customer_cannot_assign_roles(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('customer', ['agency' => $agency]);
        $target = User::factory()->create(['agency_id' => $agency->id]);

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'agent'])
            ->assertForbidden();
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        $target = User::factory()->create();

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'agent'])
            ->assertUnauthorized();
    }

    public function test_agency_admin_cannot_grant_super_admin(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $target = User::factory()->create(['agency_id' => $agency->id]);

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'super_admin'])
            ->assertForbidden();
    }

    public function test_super_admin_can_grant_super_admin(): void
    {
        $this->apiActingAsRole('super_admin');
        $target = User::factory()->create();

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'super_admin'])
            ->assertOk();

        $this->assertTrue($target->fresh()->hasRole('super_admin'));
    }

    public function test_replacing_role_removes_previous_roles(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $target = User::factory()->create(['agency_id' => $agency->id]);

        // First assign: agent
        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'agent'])
            ->assertOk();

        // Replace with: owner
        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'owner'])
            ->assertOk();

        $fresh = $target->fresh();
        $this->assertTrue($fresh->hasRole('owner'));
        $this->assertFalse($fresh->hasRole('agent'));
        $this->assertNotNull($admin);
    }

    public function test_invalid_role_returns_validation_error(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $target = User::factory()->create(['agency_id' => $agency->id]);

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'hacker'])
            ->assertStatus(422);
    }
}

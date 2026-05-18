<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Profiles\AgentProfile;
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

    public function test_agency_admin_cannot_change_role_of_user_without_agency(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        // Target has no agency binding (e.g. public customer, orphan user).
        $target = User::factory()->create(['agency_id' => null]);

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'agent'])
            ->assertForbidden();
    }

    public function test_role_assignment_does_not_create_ghost_guard_duplicates(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $target = User::factory()->create(['agency_id' => $agency->id]);

        // Count roles named `agent` before the call.
        $before = Role::where('name', 'agent')->count();

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'agent'])
            ->assertOk();

        // No new `agent` row should be created under a ghost guard_name.
        $rows = Role::where('name', 'agent')->get();
        $this->assertLessThanOrEqual($before + 1, $rows->count(), 'agent role should not be duplicated per request guard.');
        foreach ($rows as $row) {
            $this->assertSame('web', $row->guard_name, 'role guard_name must stay aligned with the seeder (web).');
        }
    }

    public function test_super_admin_assigns_agency_scoped_role_under_target_agency_team_id(): void
    {
        // PR #104 review regression — when a super_admin assigns an
        // agency-scoped role (e.g. `agent`), the role must be bound to the
        // *target* user's agency, not the actor's. Without the fix the
        // post-TCK-142 hardening resolved $teamId from the actor's active
        // profile (null for a pure super_admin), promoting an agency-
        // scoped role to a global one.
        $this->apiActingAsRole('super_admin');

        $targetAgency = Agency::factory()->create();
        $target = User::factory()->create(['agency_id' => $targetAgency->id]);

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'agent'])
            ->assertOk();

        $registrar = app(PermissionRegistrar::class);

        $registrar->setPermissionsTeamId($targetAgency->id);
        $registrar->forgetCachedPermissions();
        $this->assertTrue(
            $target->fresh()->hasRole('agent'),
            'Agent role must be assigned under the target agency team_id.',
        );

        $registrar->setPermissionsTeamId(null);
        $registrar->forgetCachedPermissions();
        $this->assertFalse(
            $target->fresh()->hasRole('agent'),
            'Agent role must NOT be assigned under team_id=null (would promote it to a global role).',
        );
    }

    public function test_super_admin_cannot_assign_agency_role_to_user_without_resolvable_agency(): void
    {
        // Multi-profile target without active context — `agency_id` accessor
        // returns null. Refusing to bind an agency-scoped role to team_id=null
        // is the correct behavior; previously it silently promoted the role.
        $this->apiActingAsRole('super_admin');

        $target = User::factory()->create();
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();
        AgentProfile::factory()->create(['user_id' => $target->id, 'agency_id' => $a->id]);
        AgentProfile::factory()->create(['user_id' => $target->id, 'agency_id' => $b->id]);

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'agent'])
            ->assertStatus(422);
    }

    public function test_super_admin_assignment_does_not_create_duplicate_team_scoped_role(): void
    {
        $this->apiActingAsRole('super_admin');

        $agency = Agency::factory()->create();
        $target = User::factory()->create(['agency_id' => $agency->id]);

        $before = Role::where('name', 'super_admin')->count();

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'super_admin'])
            ->assertOk();

        // Assigning super_admin must not create a NEW super_admin row.
        // Without the fix, findOrCreate in team context creates a duplicate.
        $after = Role::where('name', 'super_admin')->count();
        $this->assertSame($before, $after, 'super_admin should not be duplicated when assigned cross-tenant.');

        // And the target user's super_admin must be the global one (team_id = null).
        $this->assertTrue($target->fresh()->hasRole('super_admin'));
    }
}

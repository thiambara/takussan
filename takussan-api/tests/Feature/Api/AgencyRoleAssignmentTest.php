<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * Tests for PUT /api/agencies/{agency}/members/{user}/role (TCK-015).
 */
class AgencyRoleAssignmentTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_super_admin_can_assign_role_to_member_of_any_agency(): void
    {
        $this->apiActingAsRole('super_admin');

        $agency = Agency::factory()->create();
        $member = User::factory()->create(['agency_id' => $agency->id]);

        $this->apiPut("/api/agencies/{$agency->id}/members/{$member->id}/role", ['role' => 'agent'])
            ->assertOk()
            ->assertJsonPath('data.role', 'agent')
            ->assertJsonPath('data.agency_id', $agency->id);

        $this->assertTrue($member->fresh()->hasRole('agent'));
    }

    public function test_agency_admin_can_assign_role_to_member_of_own_agency(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);

        $member = User::factory()->create(['agency_id' => $agency->id]);

        $this->apiPut("/api/agencies/{$agency->id}/members/{$member->id}/role", ['role' => 'agent'])
            ->assertOk()
            ->assertJsonPath('data.role', 'agent');

        $this->assertTrue($member->fresh()->hasRole('agent'));
    }

    public function test_agency_admin_cannot_assign_role_in_another_agency(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agencyA]);

        $member = User::factory()->create(['agency_id' => $agencyB->id]);

        $this->apiPut("/api/agencies/{$agencyB->id}/members/{$member->id}/role", ['role' => 'agent'])
            ->assertForbidden();
    }

    public function test_cannot_assign_role_to_user_outside_agency(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);

        // Target is attached to a DIFFERENT agency — the URL path claims they
        // belong to $agency, which is false → 422.
        $otherAgency = Agency::factory()->create();
        $outsider = User::factory()->create(['agency_id' => $otherAgency->id]);

        $this->apiPut("/api/agencies/{$agency->id}/members/{$outsider->id}/role", ['role' => 'agent'])
            ->assertStatus(422);
    }

    public function test_invalid_role_returns_validation_error(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);

        $member = User::factory()->create(['agency_id' => $agency->id]);

        $this->apiPut("/api/agencies/{$agency->id}/members/{$member->id}/role", ['role' => 'not_a_role'])
            ->assertStatus(422);
    }

    public function test_agency_admin_cannot_grant_super_admin(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);

        $member = User::factory()->create(['agency_id' => $agency->id]);

        $this->apiPut("/api/agencies/{$agency->id}/members/{$member->id}/role", ['role' => 'super_admin'])
            ->assertForbidden();
    }

    public function test_super_admin_can_grant_super_admin_to_member(): void
    {
        $this->apiActingAsRole('super_admin');

        $agency = Agency::factory()->create();
        $member = User::factory()->create(['agency_id' => $agency->id]);

        $this->apiPut("/api/agencies/{$agency->id}/members/{$member->id}/role", ['role' => 'super_admin'])
            ->assertOk();

        $this->assertTrue($member->fresh()->hasRole('super_admin'));
    }

    public function test_regular_agent_cannot_assign_roles(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agent', ['agency' => $agency]);

        $member = User::factory()->create(['agency_id' => $agency->id]);

        $this->apiPut("/api/agencies/{$agency->id}/members/{$member->id}/role", ['role' => 'owner'])
            ->assertForbidden();
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        $agency = Agency::factory()->create();
        $member = User::factory()->create(['agency_id' => $agency->id]);

        $this->putJson("/api/agencies/{$agency->id}/members/{$member->id}/role", ['role' => 'agent'])
            ->assertUnauthorized();
    }

    public function test_replacing_role_removes_previous_roles(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);

        $member = User::factory()->create(['agency_id' => $agency->id]);

        $this->apiPut("/api/agencies/{$agency->id}/members/{$member->id}/role", ['role' => 'agent'])
            ->assertOk();

        $this->apiPut("/api/agencies/{$agency->id}/members/{$member->id}/role", ['role' => 'owner'])
            ->assertOk();

        $fresh = $member->fresh();
        $this->assertTrue($fresh->hasRole('owner'));
        $this->assertFalse($fresh->hasRole('agent'));
    }
}

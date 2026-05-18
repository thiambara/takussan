<?php

namespace Tests\Feature\Api\Permissions;

use App\Models\Agency;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\RoleDelegation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoleDelegationTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $primaryAdmin;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();

        // Create roles
        Role::create(['name' => 'agency_admin', 'guard_name' => 'web']);
        Role::create(['name' => 'agent', 'guard_name' => 'web']);
        Role::create(['name' => 'super_admin', 'guard_name' => 'web']);

        // Create agency and users
        $this->primaryAdmin = User::factory()->create();
        $this->agency = Agency::factory()->create([
            'primary_admin_id' => $this->primaryAdmin->id,
        ]);
        $this->primaryAdmin->update(['agency_id' => $this->agency->id]);

        $this->agent = User::factory()->create(['agency_id' => $this->agency->id]);
    }

    /** @test */
    public function test_admin_creates_delegation_in_future_then_status_is_scheduled(): void
    {
        $this->actingAs($this->primaryAdmin);

        $response = $this->postJson("/api/agencies/{$this->agency->id}/role-delegations", [
            'user_id' => $this->agent->id,
            'role' => 'agency_admin',
            'starts_at' => now()->addDay()->toIso8601String(),
            'ends_at' => now()->addWeek()->toIso8601String(),
            'reason' => 'Vacation coverage',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.status', 'scheduled');

        $this->assertDatabaseHas('role_delegations', [
            'user_id' => $this->agent->id,
            'agency_id' => $this->agency->id,
            'role' => 'agency_admin',
            'status' => 'scheduled',
        ]);
    }

    /** @test */
    public function test_admin_creates_delegation_immediate_then_status_is_active(): void
    {
        $this->actingAs($this->primaryAdmin);

        $response = $this->postJson("/api/agencies/{$this->agency->id}/role-delegations", [
            'user_id' => $this->agent->id,
            'role' => 'agency_admin',
            'starts_at' => null,
            'ends_at' => now()->addWeek()->toIso8601String(),
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.status', 'active');

        // Verify role was assigned via Spatie (check directly in pivot table)
        $this->agent->refresh();
        $this->assertDatabaseHas('model_has_roles', [
            'model_id' => $this->agent->id,
            'model_type' => User::class,
            'role_id' => Role::findByName('agency_admin', 'web')->id,
            'agency_id' => $this->agency->id,
        ]);
    }

    /** @test */
    public function test_index_returns_paginated_delegations_filtered_by_agency(): void
    {
        // Create delegation
        RoleDelegation::factory()->create([
            'user_id' => $this->agent->id,
            'delegator_id' => $this->primaryAdmin->id,
            'agency_id' => $this->agency->id,
            'role' => 'agency_admin',
        ]);

        // Create another agency with delegation (should not appear)
        $otherAgency = Agency::factory()->create();
        $otherAgent = User::factory()->create(['agency_id' => $otherAgency->id]);
        RoleDelegation::factory()->create([
            'user_id' => $otherAgent->id,
            'delegator_id' => $this->primaryAdmin->id,
            'agency_id' => $otherAgency->id,
            'role' => 'agency_admin',
        ]);

        $this->actingAs($this->primaryAdmin);

        $response = $this->getJson("/api/agencies/{$this->agency->id}/role-delegations");

        $response->assertStatus(200)
            ->assertJsonCount(1, 'data');
    }

    /** @test */
    public function test_index_filterable_by_status_and_user(): void
    {
        RoleDelegation::factory()->create([
            'user_id' => $this->agent->id,
            'delegator_id' => $this->primaryAdmin->id,
            'agency_id' => $this->agency->id,
            'role' => 'agency_admin',
            'status' => RoleDelegationStatus::Active,
        ]);

        $otherAgent = User::factory()->create(['agency_id' => $this->agency->id]);
        RoleDelegation::factory()->create([
            'user_id' => $otherAgent->id,
            'delegator_id' => $this->primaryAdmin->id,
            'agency_id' => $this->agency->id,
            'role' => 'agent',
            'status' => RoleDelegationStatus::Scheduled,
        ]);

        $this->actingAs($this->primaryAdmin);

        // Filter by status
        $response = $this->getJson("/api/agencies/{$this->agency->id}/role-delegations?filter[status]=active");
        $response->assertStatus(200)->assertJsonCount(1, 'data');

        // Filter by user_id
        $response = $this->getJson("/api/agencies/{$this->agency->id}/role-delegations?filter[user_id]={$this->agent->id}");
        $response->assertStatus(200)->assertJsonCount(1, 'data');
    }

    /** @test */
    public function test_admin_can_revoke_active_delegation(): void
    {
        // Create active delegation with role assigned
        $delegation = RoleDelegation::factory()->create([
            'user_id' => $this->agent->id,
            'delegator_id' => $this->primaryAdmin->id,
            'agency_id' => $this->agency->id,
            'role' => 'agency_admin',
            'status' => RoleDelegationStatus::Active,
            'activated_at' => now(),
        ]);

        // Manually assign role via Spatie to simulate active state
        $this->agent->assignRole('agency_admin', $this->agency->id);

        $this->actingAs($this->primaryAdmin);

        $response = $this->deleteJson("/api/agencies/{$this->agency->id}/role-delegations/{$delegation->id}");

        $response->assertStatus(200)
            ->assertJsonPath('data.status', 'revoked');

        // Role should be removed
        $this->agent->refresh();
        $this->assertFalse($this->agent->hasRole('agency_admin', $this->agency->id));
    }

    /** @test */
    public function test_revoke_idempotent_on_already_revoked(): void
    {
        $delegation = RoleDelegation::factory()->create([
            'user_id' => $this->agent->id,
            'delegator_id' => $this->primaryAdmin->id,
            'agency_id' => $this->agency->id,
            'role' => 'agency_admin',
            'status' => RoleDelegationStatus::Revoked,
            'revoked_at' => now(),
            'revoked_by' => $this->primaryAdmin->id,
        ]);

        $this->actingAs($this->primaryAdmin);

        // First delete
        $response1 = $this->deleteJson("/api/agencies/{$this->agency->id}/role-delegations/{$delegation->id}");
        $response1->assertStatus(200);

        // Second delete (should still return 200 but no change)
        $response2 = $this->deleteJson("/api/agencies/{$this->agency->id}/role-delegations/{$delegation->id}");
        $response2->assertStatus(200);
    }

    /** @test */
    public function test_non_admin_cannot_create_delegation_returns_403(): void
    {
        $regularAgent = User::factory()->create(['agency_id' => $this->agency->id]);
        $regularAgent->assignRole('agent', $this->agency->id);

        $this->actingAs($regularAgent);

        $response = $this->postJson("/api/agencies/{$this->agency->id}/role-delegations", [
            'user_id' => $this->agent->id,
            'role' => 'agency_admin',
            'ends_at' => now()->addWeek()->toIso8601String(),
        ]);

        $response->assertStatus(403);
    }

    /** @test */
    public function test_cannot_delegate_super_admin_returns_422(): void
    {
        $this->actingAs($this->primaryAdmin);

        $response = $this->postJson("/api/agencies/{$this->agency->id}/role-delegations", [
            'user_id' => $this->agent->id,
            'role' => 'super_admin', // Not in delegable_roles
            'ends_at' => now()->addWeek()->toIso8601String(),
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['role']);
    }

    /** @test */
    public function test_cannot_self_delegate_returns_422(): void
    {
        $this->actingAs($this->primaryAdmin);

        $response = $this->postJson("/api/agencies/{$this->agency->id}/role-delegations", [
            'user_id' => $this->primaryAdmin->id, // Self
            'role' => 'agency_admin',
            'ends_at' => now()->addWeek()->toIso8601String(),
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['user_id']);
    }

    /** @test */
    public function test_cannot_delegate_more_than_one_year_returns_422(): void
    {
        $this->actingAs($this->primaryAdmin);

        $response = $this->postJson("/api/agencies/{$this->agency->id}/role-delegations", [
            'user_id' => $this->agent->id,
            'role' => 'agency_admin',
            'ends_at' => now()->addDays(400)->toIso8601String(),
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['ends_at']);
    }

    /** @test */
    public function test_cannot_delegate_to_user_outside_agency_returns_422(): void
    {
        $otherAgency = Agency::factory()->create();
        $userFromOtherAgency = User::factory()->create(['agency_id' => $otherAgency->id]);

        $this->actingAs($this->primaryAdmin);

        $response = $this->postJson("/api/agencies/{$this->agency->id}/role-delegations", [
            'user_id' => $userFromOtherAgency->id,
            'role' => 'agency_admin',
            'ends_at' => now()->addWeek()->toIso8601String(),
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['user_id']);
    }

    /** @test */
    public function test_unauthenticated_returns_401(): void
    {
        $response = $this->postJson("/api/agencies/{$this->agency->id}/role-delegations", [
            'user_id' => $this->agent->id,
            'role' => 'agency_admin',
            'ends_at' => now()->addWeek()->toIso8601String(),
        ]);

        $response->assertStatus(401);
    }

    /** @test */
    public function test_beneficiary_can_view_own_delegation_but_not_others(): void
    {
        $beneficiary = User::factory()->create(['agency_id' => $this->agency->id]);
        app(PermissionRegistrar::class)->setPermissionsTeamId($this->agency->id);
        $beneficiary->assignRole('agent');

        // Create delegation for beneficiary
        $delegation = RoleDelegation::factory()->create([
            'user_id' => $beneficiary->id,
            'delegator_id' => $this->primaryAdmin->id,
            'agency_id' => $this->agency->id,
            'role' => 'agency_admin',
        ]);

        // Create another delegation for different user
        $otherAgent = User::factory()->create(['agency_id' => $this->agency->id]);
        RoleDelegation::factory()->create([
            'user_id' => $otherAgent->id,
            'delegator_id' => $this->primaryAdmin->id,
            'agency_id' => $this->agency->id,
            'role' => 'agent',
        ]);

        $this->actingAs($beneficiary);

        // Index returns 403 for non-admin
        $response = $this->getJson("/api/agencies/{$this->agency->id}/role-delegations");
        $response->assertStatus(403);
    }

    /** @test */
    public function test_resource_includes_user_delegator_and_translated_labels(): void
    {
        $delegation = RoleDelegation::factory()->create([
            'user_id' => $this->agent->id,
            'delegator_id' => $this->primaryAdmin->id,
            'agency_id' => $this->agency->id,
            'role' => 'agency_admin',
            'status' => RoleDelegationStatus::Active,
        ]);

        $this->actingAs($this->primaryAdmin);

        $response = $this->getJson("/api/agencies/{$this->agency->id}/role-delegations");

        $response->assertStatus(200)
            ->assertJsonPath('data.0.role_label', 'Administrateur d\'agence')
            ->assertJsonPath('data.0.status_label', 'Actif')
            ->assertJsonStructure([
                'data' => [
                    '*' => [
                        'id',
                        'user_id',
                        'user' => ['id', 'first_name', 'last_name', 'email'],
                        'delegator_id',
                        'delegator' => ['id', 'first_name', 'last_name'],
                        'role',
                        'role_label',
                        'status',
                        'status_label',
                    ],
                ],
            ]);
    }
}

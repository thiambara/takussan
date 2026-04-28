<?php

namespace Tests\Unit\Services\Permissions;

use App\Models\Agency;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Services\Permissions\RoleDelegationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class RoleDelegationServiceTest extends TestCase
{
    use RefreshDatabase;

    private RoleDelegationService $service;

    private Agency $agency;

    private User $admin;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();

        Role::create(['name' => 'agency_admin', 'guard_name' => 'web']);
        Role::create(['name' => 'agent', 'guard_name' => 'web']);

        $this->admin = User::factory()->create();
        $this->agency = Agency::factory()->create([
            'primary_admin_id' => $this->admin->id,
        ]);
        $this->admin->update(['agency_id' => $this->agency->id]);

        $this->agent = User::factory()->create(['agency_id' => $this->agency->id]);

        $this->service = app(RoleDelegationService::class);
    }

    /** @test */
    public function test_create_with_immediate_start_assigns_role_via_spatie(): void
    {
        $data = [
            'user_id' => $this->agent->id,
            'role' => 'agency_admin',
            'starts_at' => null,
            'ends_at' => now()->addWeek()->toIso8601String(),
        ];

        $delegation = $this->service->create($this->agency, $this->admin, $data);

        $this->assertEquals(RoleDelegationStatus::Active, $delegation->status);

        $this->agent->refresh();
        $this->assertDatabaseHas('model_has_roles', [
            'model_id' => $this->agent->id,
            'model_type' => User::class,
            'role_id' => Role::findByName('agency_admin', 'web')->id,
            'agency_id' => $this->agency->id,
        ]);
    }

    /** @test */
    public function test_create_with_future_start_does_not_assign_role(): void
    {
        $data = [
            'user_id' => $this->agent->id,
            'role' => 'agency_admin',
            'starts_at' => now()->addDay()->toIso8601String(),
            'ends_at' => now()->addWeek()->toIso8601String(),
        ];

        $delegation = $this->service->create($this->agency, $this->admin, $data);

        $this->assertEquals(RoleDelegationStatus::Scheduled, $delegation->status);

        $this->agent->refresh();
        $this->assertDatabaseMissing('model_has_roles', [
            'model_id' => $this->agent->id,
            'model_type' => User::class,
            'role_id' => Role::findByName('agency_admin', 'web')->id,
            'agency_id' => $this->agency->id,
        ]);
    }

    /** @test */
    public function test_revoke_removes_role_and_invalidates_cache(): void
    {
        // Create active delegation
        $delegation = RoleDelegation::factory()->create([
            'user_id' => $this->agent->id,
            'delegator_id' => $this->admin->id,
            'agency_id' => $this->agency->id,
            'role' => 'agency_admin',
            'status' => RoleDelegationStatus::Active,
            'activated_at' => now(),
        ]);

        // Pre-assign role
        $this->agent->assignRole('agency_admin', $this->agency->id);

        $this->service->revoke($delegation, $this->admin);

        $this->assertEquals(RoleDelegationStatus::Revoked, $delegation->fresh()->status);

        $this->agent->refresh();
        $this->assertDatabaseMissing('model_has_roles', [
            'model_id' => $this->agent->id,
            'model_type' => User::class,
            'role_id' => Role::findByName('agency_admin', 'web')->id,
            'agency_id' => $this->agency->id,
        ]);
    }

    /** @test */
    public function test_sync_preserves_native_role_when_delegation_revoked(): void
    {
        // Agent has native 'agent' role
        app(PermissionRegistrar::class)->setPermissionsTeamId($this->agency->id);
        $this->agent->assignRole('agent');

        // Create delegation for 'agency_admin'
        $delegation = RoleDelegation::factory()->create([
            'user_id' => $this->agent->id,
            'delegator_id' => $this->admin->id,
            'agency_id' => $this->agency->id,
            'role' => 'agency_admin',
            'status' => RoleDelegationStatus::Active,
            'activated_at' => now(),
            'user_native_roles_snapshot' => ['agent'],
        ]);

        $this->agent->assignRole('agency_admin');

        // Revoke delegation
        $this->service->revoke($delegation, $this->admin);

        // Native 'agent' role should be preserved, agency_admin should be removed
        $this->agent->refresh();
        $this->assertDatabaseHas('model_has_roles', [
            'model_id' => $this->agent->id,
            'model_type' => User::class,
            'role_id' => Role::findByName('agent', 'web')->id,
            'agency_id' => $this->agency->id,
        ]);
        $this->assertDatabaseMissing('model_has_roles', [
            'model_id' => $this->agent->id,
            'model_type' => User::class,
            'role_id' => Role::findByName('agency_admin', 'web')->id,
            'agency_id' => $this->agency->id,
        ]);
    }

    /** @test */
    public function test_sync_preserves_role_when_other_active_delegation_exists(): void
    {
        // Create two delegations for same role
        $delegation1 = RoleDelegation::factory()->create([
            'user_id' => $this->agent->id,
            'delegator_id' => $this->admin->id,
            'agency_id' => $this->agency->id,
            'role' => 'agency_admin',
            'status' => RoleDelegationStatus::Expired,
            'expired_at' => now(),
        ]);

        $delegation2 = RoleDelegation::factory()->create([
            'user_id' => $this->agent->id,
            'delegator_id' => $this->admin->id,
            'agency_id' => $this->agency->id,
            'role' => 'agency_admin',
            'status' => RoleDelegationStatus::Active,
            'activated_at' => now(),
        ]);

        $this->agent->assignRole('agency_admin', $this->agency->id);

        // Sync after first expiration
        $this->service->sync($this->agent, $this->agency);

        // Role should still be present because delegation2 is active
        $this->agent->refresh();
        $this->assertDatabaseHas('model_has_roles', [
            'model_id' => $this->agent->id,
            'model_type' => User::class,
            'role_id' => Role::findByName('agency_admin', 'web')->id,
            'agency_id' => $this->agency->id,
        ]);
    }

    /** @test */
    public function test_sync_does_not_remove_role_added_natively_during_delegation(): void
    {
        // Create delegation
        $delegation = RoleDelegation::factory()->create([
            'user_id' => $this->agent->id,
            'delegator_id' => $this->admin->id,
            'agency_id' => $this->agency->id,
            'role' => 'agency_admin',
            'status' => RoleDelegationStatus::Active,
            'activated_at' => now(),
            'user_native_roles_snapshot' => ['agency_admin'],
        ]);

        // Set team context and assign roles
        app(PermissionRegistrar::class)->setPermissionsTeamId($this->agency->id);
        $this->agent->assignRole('agency_admin');
        $this->agent->assignRole('agent');

        // Expire delegation
        $this->service->expire($delegation);

        // Both roles should still be present
        $this->agent->refresh();
        $this->assertDatabaseHas('model_has_roles', [
            'model_id' => $this->agent->id,
            'model_type' => User::class,
            'role_id' => Role::findByName('agency_admin', 'web')->id,
            'agency_id' => $this->agency->id,
        ]);
        $this->assertDatabaseHas('model_has_roles', [
            'model_id' => $this->agent->id,
            'model_type' => User::class,
            'role_id' => Role::findByName('agent', 'web')->id,
            'agency_id' => $this->agency->id,
        ]);
    }

    /** @test */
    public function test_cannot_create_self_delegation(): void
    {
        $this->expectException(ValidationException::class);
        $this->expectExceptionMessage('You cannot delegate a role to yourself.');

        $data = [
            'user_id' => $this->admin->id, // Self
            'role' => 'agency_admin',
            'ends_at' => now()->addWeek()->toIso8601String(),
        ];

        $this->service->create($this->agency, $this->admin, $data);
    }

    /** @test */
    public function test_cannot_create_for_user_outside_agency(): void
    {
        $this->expectException(ValidationException::class);
        $this->expectExceptionMessage('The user does not belong to this agency.');

        $otherAgency = Agency::factory()->create();
        $otherUser = User::factory()->create(['agency_id' => $otherAgency->id]);

        $data = [
            'user_id' => $otherUser->id,
            'role' => 'agency_admin',
            'ends_at' => now()->addWeek()->toIso8601String(),
        ];

        $this->service->create($this->agency, $this->admin, $data);
    }

    /** @test */
    public function test_cannot_delegate_to_primary_admin(): void
    {
        $this->expectException(ValidationException::class);
        $this->expectExceptionMessage('This user is already the primary administrator of the agency.');

        // Create another user as primary admin of a different agency
        $otherAdmin = User::factory()->create();
        $otherAgency = Agency::factory()->create([
            'primary_admin_id' => $otherAdmin->id,
        ]);
        $otherAdmin->update(['agency_id' => $otherAgency->id]);

        // Add this user to current agency as member
        $otherAdmin->update(['agency_id' => $this->agency->id]);

        $data = [
            'user_id' => $otherAdmin->id, // primary_admin of other agency
            'role' => 'agency_admin',
            'ends_at' => now()->addWeek()->toIso8601String(),
        ];

        $this->service->create($this->agency, $this->admin, $data);
    }
}

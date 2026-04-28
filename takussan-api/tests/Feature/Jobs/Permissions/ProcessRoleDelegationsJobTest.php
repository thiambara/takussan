<?php

namespace Tests\Feature\Jobs\Permissions;

use App\Jobs\Permissions\ProcessRoleDelegationsJob;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Enums\NotificationType;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Services\Permissions\RoleDelegationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class ProcessRoleDelegationsJobTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();

        Role::create(['name' => 'agency_admin', 'guard_name' => 'web']);

        $this->admin = User::factory()->create();
        $this->agency = Agency::factory()->create([
            'primary_admin_id' => $this->admin->id,
        ]);
        $this->admin->update(['agency_id' => $this->agency->id]);

        $this->agent = User::factory()->create(['agency_id' => $this->agency->id]);
    }

    /** @test */
    public function test_activates_scheduled_delegations_when_starts_at_passed(): void
    {
        $delegation = RoleDelegation::factory()->create([
            'user_id' => $this->agent->id,
            'delegator_id' => $this->admin->id,
            'agency_id' => $this->agency->id,
            'role' => 'agency_admin',
            'status' => RoleDelegationStatus::Scheduled,
            'starts_at' => now()->subHour(),
            'ends_at' => now()->addWeek(),
        ]);

        $this->travel(1)->hour();

        $job = new ProcessRoleDelegationsJob;
        $job->handle(app(RoleDelegationService::class));

        $delegation->refresh();
        $this->assertEquals(RoleDelegationStatus::Active, $delegation->status);
        $this->assertNotNull($delegation->activated_at);

        // Role should be assigned (check directly in pivot table)
        $this->agent->refresh();
        $this->assertDatabaseHas('model_has_roles', [
            'model_id' => $this->agent->id,
            'model_type' => User::class,
            'role_id' => Role::findByName('agency_admin', 'web')->id,
            'agency_id' => $this->agency->id,
        ]);

        // Notification should be created
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $this->agent->id,
            'type' => NotificationType::RoleDelegated->value,
        ]);
    }

    /** @test */
    public function test_does_not_activate_when_starts_at_in_future(): void
    {
        $delegation = RoleDelegation::factory()->create([
            'user_id' => $this->agent->id,
            'delegator_id' => $this->admin->id,
            'agency_id' => $this->agency->id,
            'role' => 'agency_admin',
            'status' => RoleDelegationStatus::Scheduled,
            'starts_at' => now()->addDay(),
            'ends_at' => now()->addWeek(),
            'activated_at' => null,
        ]);

        $job = new ProcessRoleDelegationsJob;
        $job->handle(app(RoleDelegationService::class));

        $delegation->refresh();
        $this->assertEquals(RoleDelegationStatus::Scheduled, $delegation->status);
        $this->assertNull($delegation->activated_at);
    }

    /** @test */
    public function test_expires_active_delegations_when_ends_at_passed(): void
    {
        // Create and manually activate delegation
        $delegation = RoleDelegation::factory()->create([
            'user_id' => $this->agent->id,
            'delegator_id' => $this->admin->id,
            'agency_id' => $this->agency->id,
            'role' => 'agency_admin',
            'status' => RoleDelegationStatus::Active,
            'starts_at' => now()->subWeek(),
            'ends_at' => now()->subHour(),
            'activated_at' => now()->subWeek(),
        ]);

        // Pre-assign role (set team context first)
        app(PermissionRegistrar::class)->setPermissionsTeamId($this->agency->id);
        $this->agent->assignRole('agency_admin');

        $this->travel(1)->hour();

        $job = new ProcessRoleDelegationsJob;
        $job->handle(app(RoleDelegationService::class));

        $delegation->refresh();
        $this->assertEquals(RoleDelegationStatus::Expired, $delegation->status);
        $this->assertNotNull($delegation->expired_at);

        // Role should be removed
        $this->agent->refresh();
        $this->assertFalse($this->agent->hasRole('agency_admin', $this->agency->id));

        // Notification should be created
        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $this->agent->id,
            'type' => NotificationType::RoleDelegationExpired->value,
        ]);
    }

    /** @test */
    public function test_idempotent_two_runs_do_not_duplicate_notifications(): void
    {
        $delegation = RoleDelegation::factory()->create([
            'user_id' => $this->agent->id,
            'delegator_id' => $this->admin->id,
            'agency_id' => $this->agency->id,
            'role' => 'agency_admin',
            'status' => RoleDelegationStatus::Scheduled,
            'starts_at' => now()->subHour(),
            'ends_at' => now()->addWeek(),
        ]);

        $this->travel(1)->hour();

        $service = app(RoleDelegationService::class);

        // First run
        $job1 = new ProcessRoleDelegationsJob;
        $job1->handle($service);

        $countAfterFirst = AppNotification::where('type', NotificationType::RoleDelegated->value)->count();

        // Second run
        $job2 = new ProcessRoleDelegationsJob;
        $job2->handle($service);

        $countAfterSecond = AppNotification::where('type', NotificationType::RoleDelegated->value)->count();

        $this->assertEquals($countAfterFirst, $countAfterSecond);
    }

    /** @test */
    public function test_concurrent_active_delegations_keep_role_until_last_expires(): void
    {
        // Create two active delegations for same user/role
        $delegation1 = RoleDelegation::factory()->create([
            'user_id' => $this->agent->id,
            'delegator_id' => $this->admin->id,
            'agency_id' => $this->agency->id,
            'role' => 'agency_admin',
            'status' => RoleDelegationStatus::Active,
            'starts_at' => now()->subWeek(),
            'ends_at' => now()->subHour(), // Expires now
            'activated_at' => now()->subWeek(),
        ]);

        $delegation2 = RoleDelegation::factory()->create([
            'user_id' => $this->agent->id,
            'delegator_id' => $this->admin->id,
            'agency_id' => $this->agency->id,
            'role' => 'agency_admin',
            'status' => RoleDelegationStatus::Active,
            'starts_at' => now()->subWeek(),
            'ends_at' => now()->addWeek(), // Still active
            'activated_at' => now()->subWeek(),
        ]);

        // Pre-assign role
        $this->agent->assignRole('agency_admin', $this->agency->id);

        $this->travel(1)->hour();

        $job = new ProcessRoleDelegationsJob;
        $job->handle(app(RoleDelegationService::class));

        $delegation1->refresh();
        $delegation2->refresh();

        // First delegation should be expired
        $this->assertEquals(RoleDelegationStatus::Expired, $delegation1->status);

        // Second delegation should still be active
        $this->assertEquals(RoleDelegationStatus::Active, $delegation2->status);

        // User should still have the role because one delegation is still active
        $this->agent->refresh();
        $this->assertDatabaseHas('model_has_roles', [
            'model_id' => $this->agent->id,
            'model_type' => User::class,
            'role_id' => Role::findByName('agency_admin', 'web')->id,
            'agency_id' => $this->agency->id,
        ]);
    }
}

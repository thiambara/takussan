<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class AgencyAgentTest extends TestCase
{
    use RefreshDatabase;

    protected function createAdminWithAgency(): array
    {
        $agency = Agency::factory()->create();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        Role::findOrCreate('admin');
        $admin = User::factory()->create(['agency_id' => $agency->id]);
        $admin->assignRole('admin');
        $agency->update(['primary_admin_id' => $admin->id]);

        return [$admin, $agency];
    }

    public function test_admin_can_add_agent_to_agency(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();
        $agent = User::factory()->create();

        Sanctum::actingAs($admin);

        $this->postJson("/api/agencies/{$agency->id}/agents", [
            'user_id' => $agent->id,
        ])->assertOk();

        $this->assertDatabaseHas('users', ['id' => $agent->id, 'agency_id' => $agency->id]);
    }

    public function test_cannot_add_user_already_in_another_agency(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();
        $otherAgency = Agency::factory()->create();
        $agent = User::factory()->create(['agency_id' => $otherAgency->id]);

        Sanctum::actingAs($admin);

        $this->postJson("/api/agencies/{$agency->id}/agents", [
            'user_id' => $agent->id,
        ])->assertStatus(422);
    }

    public function test_admin_can_remove_agent_from_agency(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();
        $agent = User::factory()->create(['agency_id' => $agency->id]);

        Sanctum::actingAs($admin);

        $this->deleteJson("/api/agencies/{$agency->id}/agents/{$agent->id}")
            ->assertOk();

        $this->assertDatabaseHas('users', ['id' => $agent->id, 'agency_id' => null]);
    }

    public function test_cannot_remove_primary_admin(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();

        Sanctum::actingAs($admin);

        $this->deleteJson("/api/agencies/{$agency->id}/agents/{$admin->id}")
            ->assertStatus(422);
    }

    public function test_non_admin_cannot_add_agent(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();
        $regularUser = User::factory()->create();
        $newAgent = User::factory()->create();

        Sanctum::actingAs($regularUser);

        $this->postJson("/api/agencies/{$agency->id}/agents", [
            'user_id' => $newAgent->id,
        ])->assertForbidden();
    }

    // --- Agency Role management ---

    public function test_admin_can_list_agency_roles(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();

        Sanctum::actingAs($admin);

        $this->getJson('/api/agency-roles')
            ->assertOk()
            ->assertJsonStructure(['data']);
    }

    public function test_admin_can_create_custom_role(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();

        Sanctum::actingAs($admin);

        $this->postJson('/api/agency-roles', [
            'name' => 'comptable',
        ])->assertCreated()
            ->assertJsonPath('data.name', 'comptable');
    }

    public function test_admin_can_delete_custom_role(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();

        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        $role = Role::create(['name' => 'temp_role', 'guard_name' => 'web', 'agency_id' => $agency->id]);

        Sanctum::actingAs($admin);

        $this->deleteJson("/api/agency-roles/{$role->id}")
            ->assertNoContent();

        $this->assertDatabaseMissing('roles', ['id' => $role->id]);
    }

    public function test_non_admin_cannot_create_role(): void
    {
        $user = User::factory()->create();

        Sanctum::actingAs($user);

        $this->postJson('/api/agency-roles', [
            'name' => 'hacked',
        ])->assertForbidden();
    }
}

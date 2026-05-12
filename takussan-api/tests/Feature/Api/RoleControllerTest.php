<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\User;
use Database\Seeders\System\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class RoleControllerTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array{User,Agency}
     */
    protected function createAgencyAdmin(): array
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $agency = Agency::factory()->create();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        Role::findOrCreate('agency_admin');
        $user = User::factory()->create(['agency_id' => $agency->id]);
        $user->assignRole('agency_admin');

        return [$user, $agency];
    }

    public function test_index_returns_predefined_and_custom_roles(): void
    {
        [$admin, $agency] = $this->createAgencyAdmin();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        Role::create(['name' => 'comptable', 'guard_name' => 'web', 'agency_id' => $agency->id]);

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/roles')->assertOk();
        $names = collect($response->json('data'))->pluck('name')->all();

        $this->assertContains('agency_admin', $names);
        $this->assertContains('comptable', $names);

        $predefined = collect($response->json('data'))->firstWhere('name', 'agency_admin');
        $this->assertSame('global', $predefined['scope']);
        $this->assertTrue($predefined['is_predefined']);

        $custom = collect($response->json('data'))->firstWhere('name', 'comptable');
        $this->assertSame('agency', $custom['scope']);
        $this->assertFalse($custom['is_predefined']);
    }

    public function test_index_filter_scope_agency_excludes_predefined(): void
    {
        [$admin, $agency] = $this->createAgencyAdmin();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        Role::create(['name' => 'comptable', 'guard_name' => 'web', 'agency_id' => $agency->id]);

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/roles?filter[scope]=agency')->assertOk();
        $names = collect($response->json('data'))->pluck('name')->all();

        $this->assertContains('comptable', $names);
        $this->assertNotContains('agency_admin', $names);
    }

    public function test_index_does_not_leak_other_agency_custom_roles(): void
    {
        [$admin, $agency] = $this->createAgencyAdmin();

        $otherAgency = Agency::factory()->create();
        app(PermissionRegistrar::class)->setPermissionsTeamId($otherAgency->id);
        Role::create(['name' => 'foreign_role', 'guard_name' => 'web', 'agency_id' => $otherAgency->id]);

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/roles')->assertOk();
        $names = collect($response->json('data'))->pluck('name')->all();

        $this->assertNotContains('foreign_role', $names);
    }

    public function test_index_with_include_permissions_returns_attached_permissions(): void
    {
        [$admin, $agency] = $this->createAgencyAdmin();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        $role = Role::create(['name' => 'comptable', 'guard_name' => 'web', 'agency_id' => $agency->id]);
        $role->givePermissionTo('properties.view');

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/roles?include=permissions&filter[scope]=agency')->assertOk();
        $custom = collect($response->json('data'))->firstWhere('name', 'comptable');

        $this->assertSame(['properties.view'], collect($custom['permissions'])->pluck('name')->all());
    }

    public function test_agency_admin_can_create_custom_role_with_permissions(): void
    {
        [$admin, $agency] = $this->createAgencyAdmin();

        Sanctum::actingAs($admin);

        $response = $this->postJson('/api/roles', [
            'name' => 'comptable',
            'permissions' => ['properties.view', 'invoices.view'],
        ])->assertCreated();

        $this->assertSame('comptable', $response->json('data.name'));
        $this->assertSame('agency', $response->json('data.scope'));
        $this->assertEqualsCanonicalizing(
            ['properties.view', 'invoices.view'],
            collect($response->json('data.permissions'))->pluck('name')->all(),
        );
        $this->assertDatabaseHas('roles', [
            'name' => 'comptable',
            'agency_id' => $agency->id,
        ]);
    }

    public function test_create_rejects_predefined_role_name_collision(): void
    {
        [$admin] = $this->createAgencyAdmin();

        Sanctum::actingAs($admin);

        $this->postJson('/api/roles', ['name' => 'agency_admin'])
            ->assertStatus(422);
    }

    public function test_create_rejects_invalid_name_format(): void
    {
        [$admin] = $this->createAgencyAdmin();

        Sanctum::actingAs($admin);

        $this->postJson('/api/roles', ['name' => 'BadName'])->assertStatus(422);
    }

    public function test_non_manager_cannot_create_role(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $user = User::factory()->create();

        Sanctum::actingAs($user);

        $this->postJson('/api/roles', ['name' => 'hacked'])->assertForbidden();
    }

    public function test_update_custom_role_replaces_permissions(): void
    {
        [$admin, $agency] = $this->createAgencyAdmin();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        $role = Role::create(['name' => 'comptable', 'guard_name' => 'web', 'agency_id' => $agency->id]);
        $role->givePermissionTo('properties.view');

        Sanctum::actingAs($admin);

        $response = $this->patchJson("/api/roles/{$role->id}", [
            'name' => 'finance',
            'permissions' => ['invoices.view', 'invoices.create'],
        ])->assertOk();

        $this->assertSame('finance', $response->json('data.name'));
        $this->assertEqualsCanonicalizing(
            ['invoices.view', 'invoices.create'],
            collect($response->json('data.permissions'))->pluck('name')->all(),
        );
    }

    public function test_cannot_update_predefined_role(): void
    {
        [$admin] = $this->createAgencyAdmin();
        $predefined = Role::query()->whereNull('agency_id')->where('name', 'agent')->firstOrFail();

        Sanctum::actingAs($admin);

        $this->patchJson("/api/roles/{$predefined->id}", ['name' => 'agent_renamed'])
            ->assertForbidden();
    }

    public function test_cannot_update_role_from_another_agency(): void
    {
        [$admin] = $this->createAgencyAdmin();

        $otherAgency = Agency::factory()->create();
        app(PermissionRegistrar::class)->setPermissionsTeamId($otherAgency->id);
        $foreign = Role::create(['name' => 'foreign', 'guard_name' => 'web', 'agency_id' => $otherAgency->id]);

        Sanctum::actingAs($admin);

        $this->patchJson("/api/roles/{$foreign->id}", ['name' => 'hijack'])->assertForbidden();
    }

    public function test_destroy_custom_role(): void
    {
        [$admin, $agency] = $this->createAgencyAdmin();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        $role = Role::create(['name' => 'comptable', 'guard_name' => 'web', 'agency_id' => $agency->id]);

        Sanctum::actingAs($admin);

        $this->deleteJson("/api/roles/{$role->id}")->assertNoContent();
        $this->assertDatabaseMissing('roles', ['id' => $role->id]);
    }

    public function test_cannot_destroy_role_assigned_to_user(): void
    {
        [$admin, $agency] = $this->createAgencyAdmin();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        $role = Role::create(['name' => 'comptable', 'guard_name' => 'web', 'agency_id' => $agency->id]);
        $member = User::factory()->create(['agency_id' => $agency->id]);
        $member->assignRole($role);

        Sanctum::actingAs($admin);

        $this->deleteJson("/api/roles/{$role->id}")
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'Impossible de supprimer ce rôle : il est attribué à 1 utilisateur(s).']);

        $this->assertDatabaseHas('roles', ['id' => $role->id]);
    }

    public function test_cannot_destroy_predefined_role(): void
    {
        [$admin] = $this->createAgencyAdmin();
        $predefined = Role::query()->whereNull('agency_id')->where('name', 'agent')->firstOrFail();

        Sanctum::actingAs($admin);

        $this->deleteJson("/api/roles/{$predefined->id}")->assertForbidden();
    }

    public function test_attach_permission_to_custom_role(): void
    {
        [$admin, $agency] = $this->createAgencyAdmin();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        $role = Role::create(['name' => 'comptable', 'guard_name' => 'web', 'agency_id' => $agency->id]);

        Sanctum::actingAs($admin);

        $response = $this->postJson("/api/roles/{$role->id}/permissions", [
            'permission' => 'invoices.view',
        ])->assertOk();

        $this->assertContains('invoices.view', collect($response->json('data.permissions'))->pluck('name')->all());
    }

    public function test_attach_unknown_permission_returns_422(): void
    {
        [$admin, $agency] = $this->createAgencyAdmin();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        $role = Role::create(['name' => 'comptable', 'guard_name' => 'web', 'agency_id' => $agency->id]);

        Sanctum::actingAs($admin);

        $this->postJson("/api/roles/{$role->id}/permissions", [
            'permission' => 'unknown.permission',
        ])->assertStatus(422);
    }

    public function test_detach_permission_from_custom_role(): void
    {
        [$admin, $agency] = $this->createAgencyAdmin();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        $role = Role::create(['name' => 'comptable', 'guard_name' => 'web', 'agency_id' => $agency->id]);
        $role->givePermissionTo('properties.view');

        Sanctum::actingAs($admin);

        $response = $this->deleteJson("/api/roles/{$role->id}/permissions/properties.view")
            ->assertOk();

        $this->assertEmpty(collect($response->json('data.permissions')));
    }

    public function test_detach_returns_404_when_permission_unknown(): void
    {
        [$admin, $agency] = $this->createAgencyAdmin();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        $role = Role::create(['name' => 'comptable', 'guard_name' => 'web', 'agency_id' => $agency->id]);

        Sanctum::actingAs($admin);

        $this->deleteJson("/api/roles/{$role->id}/permissions/totally.fake")
            ->assertNotFound();
    }

    public function test_cannot_attach_permission_to_predefined_role(): void
    {
        [$admin] = $this->createAgencyAdmin();
        $predefined = Role::query()->whereNull('agency_id')->where('name', 'agent')->firstOrFail();

        Sanctum::actingAs($admin);

        $this->postJson("/api/roles/{$predefined->id}/permissions", [
            'permission' => 'invoices.view',
        ])->assertForbidden();
    }

    public function test_super_admin_bypasses_permission_check(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $agency = Agency::factory()->create();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        app(PermissionRegistrar::class)->setPermissionsTeamId(null);
        $superAdmin = User::factory()->create(['agency_id' => $agency->id]);
        $superAdmin->assignRole('super_admin');

        Sanctum::actingAs($superAdmin);

        $this->postJson('/api/roles', [
            'name' => 'audit',
        ])->assertCreated();
    }

    public function test_permissions_catalogue_returns_grouped_by_resource(): void
    {
        [$admin] = $this->createAgencyAdmin();

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/permissions')->assertOk();
        $resources = collect($response->json('data'))->pluck('resource')->all();

        $this->assertContains('properties', $resources);
        $this->assertContains('leases', $resources);

        $properties = collect($response->json('data'))->firstWhere('resource', 'properties');
        $this->assertContains('properties.view', collect($properties['permissions'])->pluck('name')->all());
    }

    public function test_permissions_catalogue_forbidden_for_unrelated_role(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $agency = Agency::factory()->create();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        $customer = User::factory()->create(['agency_id' => $agency->id]);
        $customer->assignRole('customer');

        Sanctum::actingAs($customer);

        $this->getJson('/api/permissions')->assertForbidden();
    }

    public function test_unknown_permission_in_create_returns_422(): void
    {
        [$admin] = $this->createAgencyAdmin();

        Sanctum::actingAs($admin);

        $this->postJson('/api/roles', [
            'name' => 'comptable',
            'permissions' => ['nonexistent.permission'],
        ])->assertStatus(422);

        $this->assertDatabaseMissing('roles', ['name' => 'comptable']);

        // Sanity: confirm Permission still has expected entries.
        $this->assertGreaterThan(0, Permission::query()->count());
    }

    public function test_individual_agency_admin_cannot_list_roles(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $agency = Agency::factory()->individual()->create();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        Role::findOrCreate('agency_admin');
        $user = User::factory()->create(['agency_id' => $agency->id]);
        $user->assignRole('agency_admin');

        Sanctum::actingAs($user);

        $this->getJson('/api/roles')->assertForbidden();

        $agency->update(['kind' => AgencyKind::Standard]);
        $this->getJson('/api/roles')->assertOk();
    }
}

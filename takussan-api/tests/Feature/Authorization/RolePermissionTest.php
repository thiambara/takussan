<?php

namespace Tests\Feature\Authorization;

use App\Models\Agency;
use App\Models\User;
use Database\Seeders\System\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class RolePermissionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    public function test_six_required_roles_are_seeded(): void
    {
        $required = ['customer', 'agent', 'agency_admin', 'owner', 'service_provider', 'super_admin'];

        foreach ($required as $name) {
            $this->assertTrue(
                Role::query()->where('name', $name)->exists(),
                "Role '{$name}' expected to be seeded.",
            );
        }
    }

    public function test_crud_permissions_exist_for_each_declared_resource(): void
    {
        $resources = ['properties', 'bookings', 'customers', 'users', 'agencies'];
        $actions = ['view', 'create', 'update', 'delete'];

        foreach ($resources as $resource) {
            foreach ($actions as $action) {
                $this->assertTrue(
                    Permission::query()->where('name', "{$resource}.{$action}")->exists(),
                    "Permission '{$resource}.{$action}' expected to be seeded.",
                );
            }
        }
    }

    public function test_agent_role_has_view_create_update_but_not_delete(): void
    {
        $role = Role::query()->where('name', 'agent')->firstOrFail();

        $this->assertTrue($role->hasPermissionTo('properties.view'));
        $this->assertTrue($role->hasPermissionTo('properties.create'));
        $this->assertTrue($role->hasPermissionTo('properties.update'));
        $this->assertFalse($role->hasPermissionTo('properties.delete'));
    }

    public function test_customer_role_cannot_update_or_delete(): void
    {
        $role = Role::query()->where('name', 'customer')->firstOrFail();

        $this->assertTrue($role->hasPermissionTo('properties.view'));
        $this->assertFalse($role->hasPermissionTo('properties.update'));
        $this->assertFalse($role->hasPermissionTo('properties.delete'));
    }

    public function test_role_assignments_are_scoped_by_agency_team(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();

        $userA = User::factory()->create(['agency_id' => $agencyA->id]);
        $userB = User::factory()->create(['agency_id' => $agencyB->id]);

        app(PermissionRegistrar::class)->setPermissionsTeamId($agencyA->id);
        $userA->assignRole('agent');

        app(PermissionRegistrar::class)->setPermissionsTeamId($agencyB->id);
        $userB->assignRole('customer');

        app(PermissionRegistrar::class)->setPermissionsTeamId($agencyA->id);
        $this->assertTrue($userA->hasRole('agent'));
        $this->assertFalse($userA->hasRole('customer'));

        app(PermissionRegistrar::class)->setPermissionsTeamId($agencyB->id);
        $this->assertTrue($userB->hasRole('customer'));
        $this->assertFalse($userB->hasRole('agent'));
    }
}

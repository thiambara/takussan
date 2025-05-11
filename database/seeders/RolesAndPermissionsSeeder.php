<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

class RolesAndPermissionsSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Create permissions
        $permissions = [
            // User permissions
            ['code' => 'users.view', 'name' => 'View users', 'description' => 'View users'],
            ['code' => 'users.create', 'name' => 'Create users', 'description' => 'Create users'],
            ['code' => 'users.edit', 'name' => 'Edit users', 'description' => 'Edit users'],
            ['code' => 'users.delete', 'name' => 'Delete users', 'description' => 'Delete users'],

            // Role permissions
            ['code' => 'roles.view', 'name' => 'View roles', 'description' => 'View roles'],
            ['code' => 'roles.create', 'name' => 'Create roles', 'description' => 'Create roles'],
            ['code' => 'roles.edit', 'name' => 'Edit roles', 'description' => 'Edit roles'],
            ['code' => 'roles.delete', 'name' => 'Delete roles', 'description' => 'Delete roles'],

            // Permission permissions
            ['code' => 'permissions.view', 'name' => 'View permissions', 'description' => 'View permissions'],
            ['code' => 'permissions.create', 'name' => 'Create permissions', 'description' => 'Create permissions'],
            ['code' => 'permissions.edit', 'name' => 'Edit permissions', 'description' => 'Edit permissions'],
            ['code' => 'permissions.delete', 'name' => 'Delete permissions', 'description' => 'Delete permissions'],

            // Property permissions
            ['code' => 'properties.view', 'name' => 'View properties', 'description' => 'View properties'],
            ['code' => 'properties.create', 'name' => 'Create properties', 'description' => 'Create properties'],
            ['code' => 'properties.edit', 'name' => 'Edit properties', 'description' => 'Edit properties'],
            ['code' => 'properties.delete', 'name' => 'Delete properties', 'description' => 'Delete properties'],

            // Booking permissions
            ['code' => 'bookings.view', 'name' => 'View bookings', 'description' => 'View bookings'],
            ['code' => 'bookings.create', 'name' => 'Create bookings', 'description' => 'Create bookings'],
            ['code' => 'bookings.edit', 'name' => 'Edit bookings', 'description' => 'Edit bookings'],
            ['code' => 'bookings.delete', 'name' => 'Delete bookings', 'description' => 'Delete bookings'],

            // Customer permissions
            ['code' => 'customers.view', 'name' => 'View customers', 'description' => 'View customers'],
            ['code' => 'customers.create', 'name' => 'Create customers', 'description' => 'Create customers'],
            ['code' => 'customers.edit', 'name' => 'Edit customers', 'description' => 'Edit customers'],
            ['code' => 'customers.delete', 'name' => 'Delete customers', 'description' => 'Delete customers'],
        ];

        foreach ($permissions as $permission) {
            Permission::create($permission);
        }

        // Create roles with permissions
        $roles = [
            [
                'code' => 'admin',
                'name' => 'Administrator',
                'description' => 'Administrator with full access',
                'permissions' => Permission::all()->pluck('id')->toArray()
            ],
            [
                'code' => 'manager',
                'name' => 'Manager',
                'description' => 'Manager with limited access',
                'permissions' => Permission::whereIn('code', [
                    'users.view', 'properties.view', 'properties.create', 'properties.edit',
                    'bookings.view', 'bookings.create', 'bookings.edit',
                    'customers.view', 'customers.create', 'customers.edit'
                ])->pluck('id')->toArray()
            ],
            [
                'code' => 'user',
                'name' => 'Regular User',
                'description' => 'Regular user with basic access',
                'permissions' => Permission::whereIn('code', [
                    'properties.view', 'bookings.view', 'bookings.create',
                    'customers.view'
                ])->pluck('id')->toArray()
            ],
        ];

        foreach ($roles as $roleData) {
            $permissions = $roleData['permissions'] ?? [];
            unset($roleData['permissions']);

            $role = Role::create($roleData);
            $role->syncPermissions($permissions);
        }
    }
}

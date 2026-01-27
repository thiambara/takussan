<?php

namespace Database\Seeders;

use App\Models\Bases\Enums\UserRole;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RolesAndPermissionsSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Reset cached roles and permissions
        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        // Create permissions
        $permissions = [
            // User permissions
            'users.view',
            'users.create',
            'users.edit',
            'users.delete',

            // Role permissions
            'roles.view',
            'roles.create',
            'roles.edit',
            'roles.delete',

            // Permission permissions
            'permissions.view',
            'permissions.create',
            'permissions.edit',
            'permissions.delete',

            // Property permissions
            'properties.view',
            'properties.create',
            'properties.edit',
            'properties.delete',

            // Booking permissions
            'bookings.view',
            'bookings.create',
            'bookings.edit',
            'bookings.delete',

            // Customer permissions
            'customers.view',
            'customers.create',
            'customers.edit',
            'customers.delete',
        ];

        foreach ($permissions as $permission) {
            Permission::create(['name' => $permission]);
        }

        // Create roles with permissions

        // Admin
        $adminRole = Role::create(['name' => UserRole::Admin->value]);
        $adminRole->givePermissionTo(Permission::all());

        // Vendor
        $vendorRole = Role::create(['name' => UserRole::Vendor->value]);
        $vendorRole->givePermissionTo([
            'users.view',
            'properties.view', 'properties.create', 'properties.edit',
            'bookings.view', 'bookings.create', 'bookings.edit',
            'customers.view', 'customers.create', 'customers.edit'
        ]);

        // Customer
        $customerRole = Role::create(['name' => UserRole::Customer->value]);
        $customerRole->givePermissionTo([
            'properties.view',
            'bookings.view', 'bookings.create',
            'customers.view'
        ]);
    }
}

<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RolesAndPermissionsSeeder extends Seeder
{
    public function run(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $resources = [
            'properties', 'bookings', 'leases', 'lease_payments',
            'customers', 'conversations', 'messages',
            'maintenance_requests', 'property_visits', 'favorites',
            'agencies', 'documents', 'invoices', 'payouts',
            'saved_searches', 'reviews', 'users',
        ];

        $actions = ['view', 'create', 'update', 'delete', 'update_all', 'delete_all'];

        foreach ($resources as $resource) {
            foreach ($actions as $action) {
                Permission::firstOrCreate(['name' => "$resource.$action", 'guard_name' => 'web']);
            }
        }

        $roles = [
            'super_admin' => Permission::pluck('name')->toArray(),
            'admin' => Permission::pluck('name')->toArray(),
            'agency_admin' => $this->permissionsFor(['properties', 'bookings', 'leases', 'lease_payments', 'customers', 'conversations', 'messages', 'maintenance_requests', 'property_visits', 'documents', 'saved_searches', 'reviews']),
            'agent' => $this->permissionsFor(['properties', 'bookings', 'leases', 'customers', 'conversations', 'messages', 'property_visits', 'documents', 'saved_searches', 'reviews'], ['view', 'create', 'update']),
            'owner' => $this->permissionsFor(['properties', 'bookings', 'leases', 'lease_payments', 'conversations', 'messages', 'maintenance_requests', 'property_visits', 'documents', 'reviews'], ['view', 'create', 'update']),
            'tenant' => $this->permissionsFor(['bookings', 'leases', 'lease_payments', 'conversations', 'messages', 'maintenance_requests', 'property_visits', 'documents', 'favorites', 'saved_searches', 'reviews'], ['view', 'create']),
            'customer' => $this->permissionsFor(['properties', 'bookings', 'favorites', 'saved_searches', 'reviews', 'conversations', 'messages', 'property_visits'], ['view', 'create']),
        ];

        foreach ($roles as $name => $permissions) {
            $role = Role::firstOrCreate(['name' => $name, 'guard_name' => 'web']);
            $role->syncPermissions($permissions);
        }
    }

    /**
     * @param  array<int,string>  $resources
     * @param  array<int,string>  $actions
     * @return array<int,string>
     */
    protected function permissionsFor(array $resources, array $actions = ['view', 'create', 'update', 'delete']): array
    {
        $out = [];
        foreach ($resources as $r) {
            foreach ($actions as $a) {
                $out[] = "$r.$a";
            }
        }

        return $out;
    }
}

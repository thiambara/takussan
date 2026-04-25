<?php

namespace Database\Seeders\System;

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

        // TCK-088 — custom action that does not fit the generic CRUD set.
        // Granted to agency-side roles only (admin / agency_admin / agent /
        // owner). Tenants and customers are deliberately excluded.
        Permission::firstOrCreate(['name' => 'leases.refund_deposit', 'guard_name' => 'web']);

        $depositRefundExtras = [
            'agency_admin' => ['leases.refund_deposit'],
            'agent' => ['leases.refund_deposit'],
            'owner' => ['leases.refund_deposit'],
        ];

        $roles = [
            'super_admin' => Permission::pluck('name')->toArray(),
            'admin' => Permission::pluck('name')->toArray(),
            'agency_admin' => array_merge($this->permissionsFor(['properties', 'bookings', 'leases', 'lease_payments', 'customers', 'conversations', 'messages', 'maintenance_requests', 'property_visits', 'documents', 'saved_searches', 'reviews']), $depositRefundExtras['agency_admin']),
            'agent' => array_merge($this->permissionsFor(['properties', 'bookings', 'leases', 'customers', 'conversations', 'messages', 'property_visits', 'documents', 'saved_searches', 'reviews'], ['view', 'create', 'update']), $depositRefundExtras['agent']),
            'owner' => array_merge($this->permissionsFor(['properties', 'bookings', 'leases', 'lease_payments', 'conversations', 'messages', 'maintenance_requests', 'property_visits', 'documents', 'reviews'], ['view', 'create', 'update']), $depositRefundExtras['owner']),
            'tenant' => $this->permissionsFor(['bookings', 'leases', 'lease_payments', 'conversations', 'messages', 'maintenance_requests', 'property_visits', 'documents', 'favorites', 'saved_searches', 'reviews'], ['view', 'create']),
            'customer' => $this->permissionsFor(['properties', 'bookings', 'favorites', 'saved_searches', 'reviews', 'conversations', 'messages', 'property_visits'], ['view', 'create']),
            'service_provider' => $this->permissionsFor(['maintenance_requests', 'conversations', 'messages', 'documents'], ['view', 'update']),
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

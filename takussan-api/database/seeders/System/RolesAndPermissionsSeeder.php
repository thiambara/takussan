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
        // TCK-089 — same restriction for lease renewal/amendment.
        Permission::firstOrCreate(['name' => 'leases.renew', 'guard_name' => 'web']);
        // TCK-090 — early-termination / penalty workflow. The tenant can
        // initiate without this permission (handled directly in the
        // policy); agency-side actors need it explicitly so a customer
        // role can't accidentally trigger it via the API surface.
        Permission::firstOrCreate(['name' => 'leases.terminate', 'guard_name' => 'web']);
        // TCK-091 — annual rent review (`PATCH /leases/{id}/rent`). The
        // `_force` flag bypasses the variation-pct guard (default 20 %)
        // and is granted only to agency_admin / owner.
        Permission::firstOrCreate(['name' => 'leases.rent_review', 'guard_name' => 'web']);
        Permission::firstOrCreate(['name' => 'leases.rent_review_force', 'guard_name' => 'web']);

        // TCK-135 — gates the /admin/roles editor. Granted to agency_admin
        // (and the global admin / super_admin via Gate::before). Not part
        // of the generic CRUD grid because it scopes role/permission
        // mutations within the active profile's team_id, not a single
        // resource verb.
        Permission::firstOrCreate(['name' => 'roles.manage_in_agency', 'guard_name' => 'web']);

        // TCK-256 — gates the agency-side owner invitation surface
        // (`POST /api/agencies/{id}/owners/invite`). Default-granted to
        // `agency_admin`; an `agency_admin` may delegate it to specific
        // agents via {@see \App\Models\RoleDelegation}.
        Permission::firstOrCreate(['name' => 'invite_owner', 'guard_name' => 'web']);

        // TCK-258 — gates the team-management surface (page `/app/team`,
        // `POST /api/agencies/{id}/agents/invite`, suspend/remove agent).
        // Default-granted to `agency_admin`. An `agency_admin` may delegate
        // it to a senior agent via {@see \App\Models\RoleDelegation}.
        Permission::firstOrCreate(['name' => 'manage_team', 'guard_name' => 'web']);

        $depositRefundExtras = [
            'agency_admin' => ['leases.refund_deposit', 'leases.renew', 'leases.terminate', 'leases.rent_review', 'leases.rent_review_force', 'roles.manage_in_agency', 'invite_owner', 'manage_team'],
            'agent' => ['leases.refund_deposit', 'leases.renew', 'leases.terminate', 'leases.rent_review'],
            'owner' => ['leases.refund_deposit', 'leases.renew', 'leases.terminate', 'leases.rent_review', 'leases.rent_review_force'],
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

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\PermissionRegistrar;

/**
 * TCK-273 — Remove the redundant `admin` Spatie role.
 *
 * The `admin` role was seeded as a strict clone of `super_admin` (same full
 * permission set) but was never assigned by any code path. Every check in
 * the app paired it with `super_admin` as a "global bypass". This migration:
 *
 *   1. Promotes any orphan `admin` user (holds `admin` but not `super_admin`)
 *      to `super_admin` — preserves their privileges since the two were
 *      strictly equivalent.
 *   2. Detaches `admin` from every user (`model_has_roles`) and from every
 *      permission (`role_has_permissions`).
 *   3. Deletes the `roles` row itself.
 *
 * `down()` recreates the empty role (no permissions, no users). Information
 * about which users carried `admin` is intentionally not rebuilt — they are
 * already super_admin and the spec no longer recognizes `admin`.
 */
return new class extends Migration
{
    public function up(): void
    {
        $adminRoleIds = DB::table('roles')
            ->where('name', 'admin')
            ->where('guard_name', 'web')
            ->pluck('id')
            ->all();

        if (empty($adminRoleIds)) {
            return;
        }

        $superAdminRoleId = DB::table('roles')
            ->where('name', 'super_admin')
            ->where('guard_name', 'web')
            ->whereNull('agency_id')
            ->value('id');

        // 1. Promote orphan admins to super_admin so privileges are preserved.
        if ($superAdminRoleId !== null) {
            $adminAssignments = DB::table('model_has_roles')
                ->whereIn('role_id', $adminRoleIds)
                ->get();

            foreach ($adminAssignments as $row) {
                $alreadySuper = DB::table('model_has_roles')
                    ->where('role_id', $superAdminRoleId)
                    ->where('model_type', $row->model_type)
                    ->where('model_id', $row->model_id)
                    ->whereNull('agency_id')
                    ->exists();

                if (! $alreadySuper) {
                    DB::table('model_has_roles')->insert([
                        'role_id' => $superAdminRoleId,
                        'model_type' => $row->model_type,
                        'model_id' => $row->model_id,
                        'agency_id' => null,
                    ]);
                }
            }
        }

        // 2. Detach the admin role from every user and permission.
        DB::table('model_has_roles')->whereIn('role_id', $adminRoleIds)->delete();
        DB::table('role_has_permissions')->whereIn('role_id', $adminRoleIds)->delete();

        // 3. Drop the role itself.
        DB::table('roles')->whereIn('id', $adminRoleIds)->delete();

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        // Recreate an empty `admin` role under the web guard, team_id = null
        // (matches the original seeder shape). User assignments are not
        // restored — the information was lost by design in up().
        $exists = DB::table('roles')
            ->where('name', 'admin')
            ->where('guard_name', 'web')
            ->whereNull('agency_id')
            ->exists();

        if (! $exists) {
            DB::table('roles')->insert([
                'name' => 'admin',
                'guard_name' => 'web',
                'agency_id' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};

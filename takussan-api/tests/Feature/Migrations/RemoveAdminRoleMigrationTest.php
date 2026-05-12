<?php

namespace Tests\Feature\Migrations;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

/**
 * TCK-273 — Validates the data migration that removes the redundant `admin`
 * Spatie role and promotes orphan holders to `super_admin`.
 */
class RemoveAdminRoleMigrationTest extends TestCase
{
    use RefreshDatabase;

    private string $migrationPath = 'database/migrations/2026_05_12_100000_remove_admin_role.php';

    public function test_promotes_orphan_admin_user_to_super_admin(): void
    {
        // Re-seed the legacy admin role since RefreshDatabase + our cleanup
        // migration leave it absent.
        $this->seedLegacyAdminRole();

        $user = User::factory()->create();
        app(PermissionRegistrar::class)->setPermissionsTeamId(null);
        $user->assignRole('admin');

        $this->runMigrationUp();

        $user->refresh();
        $user->unsetRelation('roles');

        // Pin team context to null so the super_admin probe finds the
        // global assignment.
        app(PermissionRegistrar::class)->setPermissionsTeamId(null);

        $this->assertTrue($user->hasRole('super_admin'), 'orphan admin user should be promoted to super_admin');
        $this->assertFalse($user->hasRole('admin'), 'admin role assignment should be revoked');
        $this->assertFalse(
            DB::table('roles')->where('name', 'admin')->exists(),
            'admin role row should be deleted',
        );
    }

    public function test_keeps_super_admin_holder_intact_without_duplicates(): void
    {
        $this->seedLegacyAdminRole();

        $user = User::factory()->create();
        app(PermissionRegistrar::class)->setPermissionsTeamId(null);
        $user->assignRole('super_admin');
        // Re-assign admin in addition.
        $user->assignRole('admin');

        $this->runMigrationUp();

        $user->refresh();
        $user->unsetRelation('roles');

        $superAdminAssignments = DB::table('model_has_roles as mhr')
            ->join('roles as r', 'r.id', '=', 'mhr.role_id')
            ->where('mhr.model_id', $user->id)
            ->where('mhr.model_type', User::class)
            ->where('r.name', 'super_admin')
            ->count();

        $this->assertSame(1, $superAdminAssignments, 'super_admin must not be duplicated for already-super users');
    }

    public function test_is_idempotent_when_admin_role_already_removed(): void
    {
        // First run already happened via RefreshDatabase. A second invocation
        // must not throw or alter the schema.
        $this->runMigrationUp();
        $this->runMigrationUp();

        $this->assertFalse(
            DB::table('roles')->where('name', 'admin')->exists(),
            'admin role must remain absent after repeated runs',
        );
    }

    private function seedLegacyAdminRole(): void
    {
        // Seed super_admin first — the cleanup migration promotes orphan
        // admins to super_admin and silently skips if super_admin is absent.
        // In production this role is created by RolesAndPermissionsSeeder.
        if (! DB::table('roles')->where('name', 'super_admin')->whereNull('agency_id')->exists()) {
            DB::table('roles')->insert([
                'name' => 'super_admin',
                'guard_name' => 'web',
                'agency_id' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
        if (! DB::table('roles')->where('name', 'admin')->exists()) {
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

    private function runMigrationUp(): void
    {
        $migration = require base_path($this->migrationPath);
        $migration->up();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
}

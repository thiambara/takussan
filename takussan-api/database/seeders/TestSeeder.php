<?php

namespace Database\Seeders;

use App\Models\Agency;
use App\Models\User;
use Database\Seeders\System\RolesAndPermissionsSeeder;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Baseline fixtures for integration tests: one agency with one user per role.
 *
 * Users are keyed by role name in the returned context so callers can do
 * `$seeder->users['agent']` after running. Seeds roles+permissions idempotently
 * (RolesAndPermissionsSeeder uses firstOrCreate).
 *
 * Side effect: leaves `PermissionRegistrar::setPermissionsTeamId()` pinned to
 * the seeded agency so callers can `hasRole()` on the returned users directly.
 */
class TestSeeder extends Seeder
{
    public Agency $agency;

    /** @var array<string,User> */
    public array $users = [];

    public function run(): void
    {
        $this->call(RolesAndPermissionsSeeder::class);

        $this->agency = Agency::factory()->create();

        app(PermissionRegistrar::class)->setPermissionsTeamId($this->agency->id);

        foreach (Role::query()->pluck('name')->all() as $role) {
            $user = User::factory()->create(['agency_id' => $this->agency->id]);
            $user->assignRole($role);
            $this->users[$role] = $user;
        }
    }
}

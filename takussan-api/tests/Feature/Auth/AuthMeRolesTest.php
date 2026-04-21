<?php

namespace Tests\Feature\Auth;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

/**
 * Regression coverage for the Spatie teams-mode fix on /api/auth/me.
 *
 * Before the middleware was added, getRoleNames() resolved against a null
 * team context at runtime and returned []. These tests pin the fix so it
 * can't silently regress.
 */
class AuthMeRolesTest extends TestCase
{
    use RefreshDatabase;

    public function test_me_returns_agency_scoped_role(): void
    {
        $agency = Agency::factory()->create();

        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        Role::create(['name' => 'agent', 'guard_name' => 'web', 'agency_id' => $agency->id]);

        $user = User::factory()->create(['agency_id' => $agency->id]);
        $user->assignRole('agent');

        $token = $user->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('roles', ['agent'])
            ->assertJsonPath('agency_id', $agency->id);
    }

    public function test_me_returns_super_admin_with_null_team(): void
    {
        app(PermissionRegistrar::class)->setPermissionsTeamId(null);
        Role::create(['name' => 'super_admin', 'guard_name' => 'web']);

        $user = User::factory()->create(['agency_id' => null]);
        $user->assignRole('super_admin');

        $token = $user->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('roles', ['super_admin'])
            ->assertJsonPath('agency_id', null);
    }

    public function test_me_requires_authentication_even_with_team_middleware(): void
    {
        // Sanity check that the new middleware doesn't accidentally expose
        // /auth/me to anonymous callers via the sanctum guard fallback.
        $this->getJson('/api/auth/me')->assertStatus(401);
    }
}

<?php

namespace Tests\Feature\Auth;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
        $user = User::factory()->create(['agency_id' => $agency->id]);
        $this->materializeRoleProfile($user, 'agent', $agency);

        $token = $user->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('agency_id', $agency->id);
        // TCK-278 — le shim UserFactory auto-crée un OwnerProfile quand
        // agency_id est passé en attribut (legacy hosts individuels) ; on
        // a aussi matérialisé AgentProfile ci-dessus, donc `roles` contient
        // les deux. On vérifie juste la présence d'`agent`.
        $response = $this->withToken($token)->getJson('/api/auth/me');
        $this->assertContains('agent', $response->json('roles'));
    }

    public function test_me_returns_super_admin_with_null_team(): void
    {
        $user = User::factory()->create(['agency_id' => null]);
        $this->materializeRoleProfile($user, 'super_admin');

        $token = $user->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/auth/me')
            ->assertOk()
            // TCK-492 — `customer` est le PLANCHER : il accompagne désormais
            // tout compte authentifié, super-admin compris. Le modèle est
            // additif, pas exclusif.
            ->assertJsonPath('roles', ['super_admin', 'customer'])
            ->assertJsonPath('agency_id', null);
    }

    public function test_me_requires_authentication_even_with_team_middleware(): void
    {
        // Sanity check that the new middleware doesn't accidentally expose
        // /auth/me to anonymous callers via the sanctum guard fallback.
        $this->getJson('/api/auth/me')->assertStatus(401);
    }
}

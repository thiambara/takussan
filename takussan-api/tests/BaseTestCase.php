<?php

namespace Tests;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Assert;

abstract class BaseTestCase extends TestCase
{
    /**
     * TCK-278 — Crée un user dans une agence et matérialise le profil
     * polymorphe correspondant au rôle (`super_admin` → PlatformProfile ;
     * `agency_admin`/`agent`/`owner` → profil agence-scopé). Pour les rôles
     * dérivés (`customer`, `tenant`) il n'y a pas de profil polymorphe en
     * phase 1 (cf. Règle 5), donc pas d'agence implicite.
     *
     * Agency resolution (first match wins) :
     *   1. `agency`    — Agency model passé dans $attributes
     *   2. `agency_id` — raw id passé dans $attributes
     *   3. fresh Agency via factory (sauf rôles dérivés)
     *
     * @param  array<string,mixed>  $attributes  User attrs ; pass `agency` ou `agency_id` to reuse one.
     */
    protected function actingAsRole(string $role, array $attributes = [], ?string $guard = null): User
    {
        $agency = $attributes['agency'] ?? null;
        unset($attributes['agency']);

        $derivedRoles = ['customer', 'tenant'];

        if ($agency !== null) {
            $attributes['agency_id'] = $agency->id;
        } elseif (! isset($attributes['agency_id']) && ! in_array($role, $derivedRoles, true)) {
            $attributes['agency_id'] = Agency::factory()->create()->id;
        }

        $user = User::factory()->create($attributes);

        $this->materializeRoleProfile($user, $role);

        $this->actingAs($user, $guard);

        return $user;
    }

    protected function assertJsonStructurePaginated(TestResponse $response): void
    {
        $response->assertJsonStructure([
            'data',
            'meta' => ['current_page', 'last_page', 'per_page', 'total'],
            'links' => ['first', 'last', 'prev', 'next'],
        ]);
    }

    protected function assertJsonError(TestResponse $response, int $status, ?string $message = null): void
    {
        $response->assertStatus($status);
        $response->assertJsonStructure(['message']);

        if ($message !== null) {
            Assert::assertSame($message, $response->json('message'));
        }
    }

    /**
     * @deprecated TCK-278 — Le seeder spatie a été supprimé. Conservé en
     *   no-op pour compatibilité descendante avec les tests qui appellent
     *   `$this->ensureRolesSeeded()` explicitement.
     */
    protected function ensureRolesSeeded(): void
    {
        // no-op
    }
}

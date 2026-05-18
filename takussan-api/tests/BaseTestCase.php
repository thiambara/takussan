<?php

namespace Tests;

use App\Models\Agency;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\User;
use Database\Seeders\System\RolesAndPermissionsSeeder;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Assert;
use Spatie\Permission\PermissionRegistrar;

abstract class BaseTestCase extends TestCase
{
    /**
     * Creates a user in a fresh agency, assigns the given role within that
     * agency's team context, and logs the user into the default guard.
     *
     * Agency resolution (first match wins):
     *   1. `agency`    — Agency model passed in $attributes
     *   2. `agency_id` — raw id passed in $attributes
     *   3. fresh Agency via factory
     *
     * `super_admin` is assigned with a null team context so `hasRole()` keeps
     * resolving to true after subsequent `setPermissionsTeamId()` calls in the
     * same test (cross-tenant role — no agency binding).
     *
     * TCK-278 — En plus de l'assignation spatie historique, on matérialise
     * le profil polymorphe correspondant au rôle (PlatformProfile pour
     * super_admin, AgencyAdminProfile/AgentProfile/OwnerProfile sinon). Les
     * deux modèles coexistent pendant la fenêtre de migration P2/P3 ; le
     * cutover P3 supprimera la branche spatie.
     *
     * @param  array<string,mixed>  $attributes  User attrs; pass `agency` or `agency_id` to reuse one.
     */
    protected function actingAsRole(string $role, array $attributes = [], ?string $guard = null): User
    {
        $this->ensureRolesSeeded();

        $agency = $attributes['agency'] ?? null;
        unset($attributes['agency']);

        // TCK-278 — Pour les rôles dérivés (`customer`, `tenant`) il n'y a
        // pas de profil polymorphe en phase 1 (cf. Règle 5). On ne crée pas
        // d'agence implicite pour eux, sinon le shim UserFactory créerait
        // un OwnerProfile parasite qui ferait passer le user pour un owner.
        $derivedRoles = ['customer', 'tenant'];

        if ($agency !== null) {
            $attributes['agency_id'] = $agency->id;
        } elseif (! isset($attributes['agency_id']) && ! in_array($role, $derivedRoles, true)) {
            $attributes['agency_id'] = Agency::factory()->create()->id;
        }

        $user = User::factory()->create($attributes);

        $registrar = app(PermissionRegistrar::class);
        $registrar->setPermissionsTeamId($role === 'super_admin' ? null : $user->agency_id);
        $user->assignRole($role);

        // TCK-278 — Matérialiser le profil polymorphe correspondant au rôle,
        // en plus de l'assignation spatie historique, pour que les sites
        // d'appel refactorés (`canActAt`, `isAgentAt`, etc.) qui consultent
        // les profils plutôt que la table `roles` aient l'information
        // attendue. Les deux modèles coexistent pendant la fenêtre de
        // migration P2/P3 ; le cutover P3 supprimera la branche spatie.
        $this->materializeProfileForRole($user, $role);

        $this->actingAs($user, $guard);

        return $user;
    }

    /**
     * TCK-278 — Matérialise le profil polymorphe correspondant au rôle de
     * coexistence spatie. Alias interne vers `materializeRoleProfile`
     * défini sur `TestCase` (helper universel disponible partout).
     */
    private function materializeProfileForRole(User $user, string $role): void
    {
        $this->materializeRoleProfile($user, $role);
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

    protected function ensureRolesSeeded(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);
    }
}

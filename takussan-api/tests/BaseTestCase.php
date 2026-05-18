<?php

namespace Tests;

use App\Models\Agency;
use App\Models\Enums\PlatformProfileLevel;
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

        if ($agency !== null) {
            $attributes['agency_id'] = $agency->id;
        } elseif (! isset($attributes['agency_id'])) {
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
     * coexistence spatie. Idempotent (firstOrCreate sur la clé naturelle).
     *
     * - super_admin → PlatformProfile (cross-tenant, pas de scope agence)
     * - agency_admin / agent → profil agence-scopé créé en plus du shim
     *   OwnerProfile de TCK-142 ; l'accessor `User::getAgencyIdAttribute`
     *   gère le cas multi-profils dans la même agence.
     * - owner → déjà couvert par le shim UserFactory ; no-op.
     * - customer / tenant / admin / service_provider / broker → no-op
     *   (gérés explicitement par les tests qui en ont besoin).
     */
    private function materializeProfileForRole(User $user, string $role): void
    {
        if ($role === 'super_admin') {
            PlatformProfile::query()->firstOrCreate(
                ['user_id' => $user->id],
                [
                    'level' => PlatformProfileLevel::SuperAdmin,
                    'granted_at' => now(),
                ],
            );

            return;
        }

        $agencyId = $user->agency_id;
        if ($agencyId === null) {
            return;
        }

        match ($role) {
            'agency_admin' => AgencyAdminProfile::query()->firstOrCreate(
                ['user_id' => $user->id, 'agency_id' => $agencyId],
            ),
            'agent' => AgentProfile::query()->firstOrCreate(
                ['user_id' => $user->id, 'agency_id' => $agencyId],
            ),
            default => null,
        };
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

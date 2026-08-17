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

    /**
     * L'enveloppe de pagination canonique (TCK-304) : `data` + les quatre clés de `meta`.
     *
     * ⚠ Cet helper exigeait aussi une racine `links` — mesuré le 2026-08-17 : **51 des 57**
     * endpoints paginés ne l'émettaient pas, et **aucun test ne l'appelait**. Il aurait donc
     * rougi sur presque toute l'API si on s'en était servi, ce qui est précisément la raison pour
     * laquelle personne ne s'en servait. `links` a été retiré des 5 endpoints qui l'émettaient
     * (aucun lecteur, ni côté front ni côté tests), et de cette assertion.
     *
     * Il est plus STRICT qu'avant sur ce qui reste : les quatre valeurs sont vérifiées entières,
     * pas seulement présentes. Une clé présente valant `null` satisfaisait l'ancienne version.
     * Des clés de méta supplémentaires (`pending_count`, `unread`, `totals`…) restent permises :
     * elles sont propres à l'endpoint et ne font pas partie du contrat de pagination.
     */
    protected function assertJsonStructurePaginated(TestResponse $response): void
    {
        $response->assertJsonStructure([
            'data',
            'meta' => ['total', 'per_page', 'current_page', 'last_page'],
        ]);

        foreach (['total', 'per_page', 'current_page', 'last_page'] as $cle) {
            Assert::assertIsInt(
                $response->json("meta.$cle"),
                "meta.$cle doit être un entier — l'enveloppe de pagination canonique (TCK-304)."
            );
        }
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

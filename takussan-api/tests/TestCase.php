<?php

namespace Tests;

use App\Models\Agency;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\TestCase as LaravelTestCase;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Assert;
use Tests\Support\SearchableModels;

/**
 * LA classe de base des tests qui ont besoin de l'application Laravel.
 *
 * TCK-309 — il y en avait TROIS, en chaîne linéaire : `TestCase` →
 * `BaseTestCase` → `ApiTestCase`, sans qu'aucun document ne dise laquelle
 * étendre. Le maillon du milieu n'avait pas d'usage propre : il portait des
 * helpers (`actingAsRole`, assertions JSON) que rien ne réservait aux tests
 * non-API, et 49 classes l'étendaient contre 38 pour `ApiTestCase` — un
 * partage qui ne suivait aucune règle, seulement l'ordre d'écriture. Il a été
 * fondu ici et supprimé.
 *
 * ⚠ La règle qui remplace le choix — elle est écrite dans
 * `takussan-api/CLAUDE.md` § Tests, et gardée par
 * `scripts/check-test-base-classes.mjs` :
 *
 *   1. `PHPUnit\Framework\TestCase` — test unitaire PUR, qui ne touche ni
 *      base, ni conteneur, ni HTTP. Il ne démarre pas l'application, et c'est
 *      tout son intérêt.
 *   2. `Tests\TestCase` (cette classe) — tout ce qui a besoin de
 *      l'application : modèles, services, commandes, jobs, policies.
 *   3. `Tests\ApiTestCase` — tout ce qui frappe une route `/api/*`, parce
 *      qu'elle seule authentifie via le garde `sanctum`.
 *
 * Une quatrième classe de base ne s'ajoute pas : elle se justifie par un
 * QUATRIÈME usage, et la garde exige alors qu'on l'y déclare.
 */
abstract class TestCase extends LaravelTestCase
{
    /**
     * La synchronisation Scout est COUPÉE PAR DÉFAUT pour toute la suite.
     *
     * `phpunit.xml` force `SCOUT_DRIVER=meilisearch` avec `SCOUT_QUEUE=false`
     * et `SCOUT_AFTER_COMMIT=false` : sans cette coupure, chaque `save()` d'un
     * modèle indexable — dans N'IMPORTE quel test, y compris ceux qui n'ont
     * rien à voir avec la recherche — poussait un document synchrone dans
     * Meilisearch. Mesuré sur une exécution : 3308 tâches, dont 2628 sur
     * l'index des biens, pour une vingtaine de tests qui en avaient
     * réellement besoin. La file débordait, la barrière de synchronisation
     * expirait, et des tests de recherche justes rougissaient au hasard.
     *
     * ⚠ ORDRE D'EXÉCUTION : la coupure doit précéder `parent::setUp()`, car
     * c'est `setUpTheTestEnvironment()` qui appelle `setUpTraits()` — donc le
     * `setUpInteractsWithMeilisearch()` du concern, qui rallume. L'inverse
     * couperait juste après avoir rallumé, et les tests de recherche
     * cesseraient d'indexer sans le dire.
     *
     * L'état est statique dans `Laravel\Scout\ModelObserver` et survit donc
     * d'un test à l'autre : il faut le reposer à CHAQUE `setUp()`, pas une
     * fois par processus.
     */
    protected function setUp(): void
    {
        foreach (SearchableModels::all() as $model) {
            $model::disableSearchSyncing();
        }

        parent::setUp();
    }

    /**
     * TCK-278 — Helper universel pour les tests qui construisent les
     * users manuellement (sans `actingAsRole`). Crée le profil
     * polymorphe qui matérialise le rôle (cf. Règle 5). Idempotent.
     */
    public function materializeRoleProfile(User $user, string $role, ?Agency $agency = null): void
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

        $agencyId = $agency?->id ?? $user->agency_id;
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
            'owner' => OwnerProfile::query()->firstOrCreate(
                ['user_id' => $user->id, 'agency_id' => $agencyId],
            ),
            default => null,
        };
    }

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
     * TCK-304 × TCK-309 — défaut d'INTÉGRATION, réparé ici.
     *
     * TCK-304 avait corrigé ce helper dans `Tests\BaseTestCase` ; TCK-309 a fondu
     * `BaseTestCase` dans cette classe. Les deux branches étaient vertes seules, et la
     * fusion a réintroduit l'ANCIENNE version — celle qui exige `links`.
     *
     * Deux changements, tous deux de TCK-304 :
     *
     * 1. **`links` n'est plus exigé.** 52 des 57 contrôleurs ne l'émettaient pas ; l'exiger
     *    est précisément ce qui faisait qu'aucun test n'appelait ce helper — il aurait rougi
     *    partout, donc on ne s'en servait pas. Une assertion que personne n'ose invoquer ne
     *    garde rien.
     * 2. **Les quatre valeurs de `meta` sont vérifiées ENTIÈRES.** C'est le durcissement qui
     *    remplace `links` : une enveloppe qui rendrait `"12"` au lieu de `12` satisfaisait
     *    l'ancienne structure sans que rien ne bronche.
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

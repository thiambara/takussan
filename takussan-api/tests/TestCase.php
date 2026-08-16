<?php

namespace Tests;

use App\Models\Agency;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Tests\Support\SearchableModels;

abstract class TestCase extends BaseTestCase
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
}

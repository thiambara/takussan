<?php

namespace Tests\Unit\Testing;

use App\Models\Property;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunInSeparateProcess;
use Tests\Support\TestSearchIndex;
use Tests\TestCase;

/**
 * TCK-974 (P53.01) — la suppression des index du processus est programmée
 * pour TOUT processus de test, et non par le seul `InteractsWithMeilisearch`.
 *
 * `disableSearchSyncing()` ne coupe que l'observateur de modèle : un
 * `->searchable()` explicite de `app/` (tags d'un bien, boost, réindexation
 * géo…) pousse quand même le document. Mesuré le 2026-10-19 :
 * `PropertyTagsTest` seul laissait `testing_<jeton>_properties` derrière lui.
 *
 * ⚠ Cette classe ne porte PAS le concern, et le test tourne dans un
 * processus à lui : sinon, un test de recherche joué avant dans le même
 * processus aurait déjà programmé le nettoyage, et le vert ne prouverait rien.
 */
class SearchIndexCleanupTest extends TestCase
{
    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function test_cleanup_is_programmed_without_the_meilisearch_concern(): void
    {
        // Le chemin qui écrit sans le concern : un appel explicite.
        $this->assertStringStartsWith(TestSearchIndex::prefix(), Property::make()->searchableAs());

        $this->assertTrue(
            TestSearchIndex::cleanupIsRegistered(),
            'Un processus de test sans InteractsWithMeilisearch doit programmer la suppression de ses index testing_<jeton>_*.',
        );
    }
}

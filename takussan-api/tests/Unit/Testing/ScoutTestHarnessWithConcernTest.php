<?php

namespace Tests\Unit\Testing;

use Laravel\Scout\ModelObserver;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\Support\SearchableModels;
use Tests\TestCase;

/**
 * Le pendant de {@see ScoutTestHarnessTest} : avec le concern, la
 * synchronisation Scout doit être RALLUMÉE, sinon les tests de recherche qui
 * s'appuient sur les événements de modèle (et non sur `indexProperties()`)
 * cesseraient silencieusement d'indexer.
 */
class ScoutTestHarnessWithConcernTest extends TestCase
{
    use InteractsWithMeilisearch;

    public function test_the_concern_re_enables_scout_syncing(): void
    {
        $this->assertNotEmpty(SearchableModels::all());

        foreach (SearchableModels::all() as $model) {
            $this->assertFalse(
                ModelObserver::syncingDisabledFor($model),
                "InteractsWithMeilisearch doit rallumer la synchronisation Scout pour {$model}.",
            );
        }
    }
}

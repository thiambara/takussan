<?php

namespace Tests\Unit\Testing;

use App\Models\Property;
use Laravel\Scout\ModelObserver;
use Tests\Support\SearchableModels;
use Tests\TestCase;

/**
 * La CAUSE du débordement : `phpunit.xml` force
 * `SCOUT_DRIVER=meilisearch` + `SCOUT_QUEUE=false`, donc CHAQUE `save()` de la
 * suite ENTIÈRE poussait un document synchrone. Mesure sur une exécution :
 * 3308 tâches, dont 2628 sur `testing_properties`, pour une poignée de tests
 * qui en avaient réellement besoin. La file débordait, la barrière expirait,
 * et des tests qui n'ont rien à voir avec la recherche rougissaient.
 *
 * La synchronisation Scout est désormais coupée par défaut dans la classe de
 * base, et rallumée UNIQUEMENT par le concern (cf.
 * {@see ScoutTestHarnessWithConcernTest}).
 */
class ScoutTestHarnessTest extends TestCase
{
    public function test_scout_syncing_is_off_by_default(): void
    {
        $this->assertNotEmpty(SearchableModels::all());

        foreach (SearchableModels::all() as $model) {
            $this->assertTrue(
                ModelObserver::syncingDisabledFor($model),
                "La synchronisation Scout devrait être coupée pour {$model} dans un test qui ne porte pas InteractsWithMeilisearch.",
            );
        }
    }

    public function test_the_index_prefix_is_unique_per_test_process(): void
    {
        $prefix = config('scout.prefix');

        // Le littéral statique `testing_` laissait deux suites simultanées
        // écrire dans les mêmes index et se détruire mutuellement.
        $this->assertNotSame('testing_', $prefix);
        $this->assertMatchesRegularExpression('/^testing_[0-9a-z]+_$/', $prefix);
        $this->assertStringStartsWith($prefix, Property::make()->searchableAs());
    }
}

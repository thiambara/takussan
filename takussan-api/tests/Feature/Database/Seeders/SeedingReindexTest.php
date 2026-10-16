<?php

namespace Tests\Feature\Database\Seeders;

use Database\Seeders\YearOfActivitySeeder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\LazyCollection;
use Laravel\Scout\Builder;
use Laravel\Scout\EngineManager;
use Laravel\Scout\Engines\Engine;
use ReflectionMethod;
use ReflectionProperty;
use Tests\Support\SearchableModels;
use Tests\TestCase;

/**
 * TCK-701 (piste P16.01) — après un seed, TOUS les modèles indexés sont réindexés.
 *
 * Le seeder coupe Scout pendant les insertions, puis ne réindexait qu'une liste
 * écrite à la main : `Property`, `Document`, `Message`. `Customer`,
 * `MaintenanceRequest`, `User` et `Agency`, devenus `Searchable` avec TCK-281,
 * n'y étaient pas : leurs index restaient vides (2 clients indexés pour 564 en
 * base), et `filter[search]` rendait une liste vide sur une base pleine.
 *
 * Le test passe par un moteur espion : `removeAllFromSearch()` appelle
 * `flush()` une fois par modèle réindexé, qu'il y ait des lignes ou non.
 */
class SeedingReindexTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_seeder_reindexe_chaque_modele_searchable(): void
    {
        $espion = new class extends Engine
        {
            /** @var array<int,class-string> */
            public array $vides = [];

            public function update($models): void {}

            public function delete($models): void {}

            public function search(Builder $builder): mixed
            {
                return [];
            }

            public function paginate(Builder $builder, $perPage, $page): mixed
            {
                return [];
            }

            public function mapIds($results): \Illuminate\Support\Collection
            {
                return collect();
            }

            public function map(Builder $builder, $results, $model): Collection
            {
                return $model->newCollection();
            }

            public function lazyMap(Builder $builder, $results, $model): LazyCollection
            {
                return LazyCollection::empty();
            }

            public function getTotalCount($results): int
            {
                return 0;
            }

            public function flush($model): void
            {
                $this->vides[] = $model::class;
            }

            public function createIndex($name, array $options = []): mixed
            {
                return null;
            }

            public function deleteIndex($name): mixed
            {
                return null;
            }
        };

        app(EngineManager::class)->extend('espion', fn () => $espion);

        $seeder = app(YearOfActivitySeeder::class);
        (new ReflectionProperty(YearOfActivitySeeder::class, 'originalScoutDriver'))->setValue($seeder, 'espion');
        (new ReflectionMethod(YearOfActivitySeeder::class, 'reindexSearchableModels'))->invoke($seeder);

        $reindexes = array_values(array_unique($espion->vides));
        sort($reindexes);

        $this->assertSame(SearchableModels::all(), $reindexes);
    }
}

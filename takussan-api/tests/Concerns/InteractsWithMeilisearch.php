<?php

namespace Tests\Concerns;

use App\Models\Property;
use Illuminate\Support\Facades\Artisan;
use Meilisearch\Client;
use Meilisearch\Contracts\TasksQuery;
use Tests\Support\MeilisearchBarrier;
use Tests\Support\MeilisearchNotIdleException;
use Tests\Support\SearchableModels;
use Tests\Support\TestSearchIndex;
use Tests\TestCase;

/**
 * Test concern for search tests running against a live Meilisearch.
 *
 * `setUpInteractsWithMeilisearch()` is auto-invoked by Laravel's
 * `TestCase::setUpTraits()` (after `RefreshDatabase`): it syncs the index
 * settings once per process, RE-ENABLES Scout syncing — which
 * {@see TestCase} turns off for the whole suite — then empties the
 * managed indexes so a `RefreshDatabase` rollback never leaves stale
 * documents behind.
 *
 * After seeding fixtures, a test must call `indexProperties()` (or
 * `indexSearchable(...)`) so the data is pushed to Meilisearch and indexed
 * before the search endpoint is hit — Meilisearch indexing is asynchronous.
 *
 * Ce concern est le SEUL point du harnais qui écrit dans Meilisearch : c'est
 * pourquoi c'est ici qu'on programme la suppression des index du processus
 * (cf. {@see TestSearchIndex::registerCleanup()}).
 */
trait InteractsWithMeilisearch
{
    private static bool $meilisearchSettingsSynced = false;

    protected function setUpInteractsWithMeilisearch(): void
    {
        // La synchronisation Scout est coupée par défaut pour toute la suite
        // (cf. Tests\TestCase) : sans cette ligne, un test de recherche qui
        // s'appuie sur les événements de modèle plutôt que sur
        // `indexProperties()` cesserait silencieusement d'indexer.
        foreach ($this->meilisearchManagedModels() as $model) {
            $model::enableSearchSyncing();
        }

        if (! self::$meilisearchSettingsSynced) {
            Artisan::call('scout:sync-index-settings');
            TestSearchIndex::registerCleanup($this->meilisearchClient());
            self::$meilisearchSettingsSynced = true;
        }

        foreach ($this->meilisearchManagedModels() as $model) {
            $model::removeAllFromSearch();
        }
        $this->waitForMeilisearch();
    }

    /**
     * Searchable indexes reset before each test.
     *
     * DÉRIVÉE, jamais recopiée : la version manuelle de cette liste valait
     * `[Property, Document]` et avait oublié `Message`, dont les documents
     * n'étaient donc jamais purgés entre deux tests.
     *
     * @return array<int,class-string>
     */
    protected function meilisearchManagedModels(): array
    {
        return SearchableModels::all();
    }

    /** Bulk-index every seeded property and block until Meilisearch is done. */
    protected function indexProperties(): void
    {
        $this->indexSearchable(Property::class);
    }

    /**
     * Bulk-index every seeded record of the given Searchable models and block
     * until Meilisearch has finished processing.
     *
     * @param  class-string  ...$models
     */
    protected function indexSearchable(string ...$models): void
    {
        foreach ($models as $model) {
            $model::makeAllSearchable();
        }
        $this->waitForMeilisearch();
    }

    /**
     * Block until no Meilisearch task is enqueued or processing (10s cap).
     *
     * ⚠ Cette méthode LÈVE quand le plafond est atteint. Elle retournait
     * normalement — sans exception, sans assertion, sans trace — et le test
     * enchaînait sur un index à moitié construit. C'est la ligne qui a coûté
     * le plus cher ici : elle transformait une course en test rouge aléatoire.
     *
     * @throws MeilisearchNotIdleException
     */
    protected function waitForMeilisearch(float $timeout = 10.0): void
    {
        $client = $this->meilisearchClient();

        // ⚠ Filtré sur NOS index. `getTasks()` sans `setIndexUids()` rend la
        // file de l'instance ENTIÈRE : depuis que chaque processus a son
        // préfixe, attendre la file globale ferait attendre une exécution sur
        // les tâches d'une autre — on aurait déplacé la course au lieu de la
        // supprimer.
        $indexUids = $this->meilisearchManagedIndexes();

        MeilisearchBarrier::await(
            fn () => $client->getTasks(
                (new TasksQuery)
                    ->setStatuses(['enqueued', 'processing'])
                    ->setIndexUids($indexUids)
            )->getResults(),
            $timeout,
        );
    }

    /**
     * Les UID d'index de CE processus, dérivés des modèles gérés.
     *
     * @return array<int,string>
     */
    protected function meilisearchManagedIndexes(): array
    {
        return array_values(array_map(
            fn (string $model) => (new $model)->searchableAs(),
            $this->meilisearchManagedModels(),
        ));
    }

    private function meilisearchClient(): Client
    {
        return new Client(
            config('scout.meilisearch.host'),
            config('scout.meilisearch.key'),
        );
    }
}

<?php

namespace Tests\Concerns;

use App\Models\Property;
use Illuminate\Support\Facades\Artisan;
use Meilisearch\Client;
use Meilisearch\Contracts\BatchesQuery;
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
    /** Voir {@see self::pendingTasksQuery()} : le serveur pagine `GET /tasks` à 20 par défaut. */
    public const PENDING_TASKS_PAGE_LIMIT = 10000;

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
     * Bloque tant que Meilisearch a des tâches `enqueued`/`processing` sur les
     * index de CE processus.
     *
     * ⚠ Cette méthode LÈVE. Elle retournait normalement — sans exception, sans
     * assertion, sans trace — et le test enchaînait sur un index à moitié
     * construit. C'est la ligne qui a coûté le plus cher ici : elle
     * transformait une course en test rouge aléatoire.
     *
     * ⚠⚠ Depuis TCK-334 (2026-08-22), la grandeur surveillée n'est plus le
     * temps d'attente mais le SILENCE DU SERVEUR : on abandonne quand
     * Meilisearch cesse de produire des batchs, pas quand on a attendu
     * longtemps. Le raisonnement complet, chiffres compris, est dans le
     * docblock de {@see MeilisearchBarrier} — il ne se recopie pas ici.
     *
     * @param  float|null  $stallTimeout  Secondes SANS battement du serveur (défaut : la constante).
     * @param  float|null  $absoluteCap  Plafond absolu (défaut : la constante).
     *
     * @throws MeilisearchNotIdleException
     */
    protected function waitForMeilisearch(?float $stallTimeout = null, ?float $absoluteCap = null): void
    {
        $client = $this->meilisearchClient();

        // ⚠ Filtré sur NOS index. `getTasks()` sans `setIndexUids()` rend la
        // file de l'instance ENTIÈRE : depuis que chaque processus a son
        // préfixe, attendre la file globale ferait attendre une exécution sur
        // les tâches d'une autre — on aurait déplacé la course au lieu de la
        // supprimer.
        $indexUids = $this->meilisearchManagedIndexes();

        MeilisearchBarrier::await(
            fetchPending: fn () => $client->getTasks(
                self::pendingTasksQuery($indexUids)
            )->getResults(),
            fetchHeartbeat: fn () => $this->meilisearchHeartbeat($client),
            stallTimeout: $stallTimeout ?? MeilisearchBarrier::STALL_TIMEOUT_SECONDS,
            absoluteCap: $absoluteCap ?? MeilisearchBarrier::ABSOLUTE_CAP_SECONDS,
        );
    }

    /**
     * La requête des tâches en attente sur nos index.
     *
     * ⚠ `setLimit()` N'EST PAS COSMÉTIQUE, et son absence a menti pendant tout
     * le temps où elle a duré : `GET /tasks` PAGINE, et le serveur répond
     * `limit: 20` par défaut (mesuré le 2026-08-22 sur Meilisearch 1.16). Le
     * `count($pending)` du diagnostic de {@see MeilisearchBarrier} plafonnait
     * donc à 20 — c'est-à-dire qu'il sous-déclarait l'ampleur du problème au
     * moment PRÉCIS où on a besoin de la connaître : le backlog auto-infligé
     * que D-44 a mesuré valait **3308 tâches**, et le message en aurait
     * annoncé 20.
     *
     * Le plafond retenu, 10000, couvre 3× ce pire backlog mesuré. Il ne coûte
     * rien en régime nominal : la requête est filtrée sur `enqueued`/
     * `processing` ET sur nos seuls index, donc elle ne matérialise que ce qui
     * reste vraiment à faire — 0,166 s d'attente maximale mesurée sur les
     * 88 appels de `tests/Feature/Search/` (2026-08-22). Le serveur accepte
     * cette valeur : `GET /tasks?limit=10000` rend `limit: 10000` (mesuré).
     *
     * Extraite en méthode STATIQUE pour être testable sans moteur — cf.
     * `tests/Unit/Testing/MeilisearchBarrierTest.php`, qui casse si la limite
     * disparaît.
     *
     * @param  array<int,string>  $indexUids
     */
    public static function pendingTasksQuery(array $indexUids): TasksQuery
    {
        return (new TasksQuery)
            ->setStatuses(['enqueued', 'processing'])
            ->setIndexUids($indexUids)
            ->setLimit(self::PENDING_TASKS_PAGE_LIMIT);
    }

    /**
     * L'empreinte du dernier batch du serveur — le « battement » que la
     * barrière surveille.
     *
     * `GET /batches?limit=1` rend le batch le plus récent. Son `uid` change à
     * chaque nouveau batch, et son `progress` avance tant que le batch tourne
     * (`null` une fois fini) : l'empreinte des deux bouge donc dès que le
     * serveur fait quoi que ce soit, **pour n'importe quel index**, y compris
     * ceux d'une autre exécution de la suite. C'est voulu : la file est
     * globale au serveur (TCK-334), donc un serveur qui travaille pour
     * quelqu'un d'autre est un serveur vivant, et attendre est la bonne
     * réponse.
     */
    private function meilisearchHeartbeat(Client $client): string
    {
        $batch = $client->getBatches((new BatchesQuery)->setLimit(1))->getResults()[0] ?? null;

        if ($batch === null) {
            return 'aucun-batch';
        }

        return json_encode([
            'uid' => is_array($batch) ? ($batch['uid'] ?? null) : null,
            'progress' => is_array($batch) ? ($batch['progress'] ?? null) : null,
        ]);
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

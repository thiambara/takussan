<?php

namespace Tests\Concerns;

use App\Models\Document;
use App\Models\Property;
use Illuminate\Support\Facades\Artisan;
use Meilisearch\Client;
use Meilisearch\Contracts\TasksQuery;

/**
 * Test concern for search tests running against a live Meilisearch.
 *
 * `setUpInteractsWithMeilisearch()` is auto-invoked by Laravel's
 * `TestCase::setUpTraits()` (after `RefreshDatabase`): it syncs the index
 * settings once per process, then empties the managed indexes so a
 * `RefreshDatabase` rollback never leaves stale documents behind.
 *
 * After seeding fixtures, a test must call `indexProperties()` (or
 * `indexSearchable(...)`) so the data is pushed to Meilisearch and indexed
 * before the search endpoint is hit — Meilisearch indexing is asynchronous.
 */
trait InteractsWithMeilisearch
{
    private static bool $meilisearchSettingsSynced = false;

    /**
     * Searchable indexes reset before each test.
     *
     * @var array<int,class-string>
     */
    private array $meilisearchManagedModels = [Property::class, Document::class];

    protected function setUpInteractsWithMeilisearch(): void
    {
        if (! self::$meilisearchSettingsSynced) {
            Artisan::call('scout:sync-index-settings');
            self::$meilisearchSettingsSynced = true;
        }

        foreach ($this->meilisearchManagedModels as $model) {
            $model::removeAllFromSearch();
        }
        $this->waitForMeilisearch();
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

    /** Block until no Meilisearch task is enqueued or processing (10s cap). */
    protected function waitForMeilisearch(): void
    {
        $client = $this->meilisearchClient();
        $deadline = microtime(true) + 10.0;

        do {
            $pending = $client->getTasks(
                (new TasksQuery)->setStatuses(['enqueued', 'processing'])
            )->getResults();

            if ($pending === []) {
                return;
            }

            usleep(50_000);
        } while (microtime(true) < $deadline);
    }

    private function meilisearchClient(): Client
    {
        return new Client(
            config('scout.meilisearch.host'),
            config('scout.meilisearch.key'),
        );
    }
}

<?php

namespace Tests\Unit\Testing;

use Illuminate\Support\Facades\Storage;
use Tests\Support\TestProcessToken;
use Tests\TestCase;

/**
 * La SECONDE cause de non-déterminisme, découverte en rejouant l'épreuve des
 * deux suites parallèles une fois la course Meilisearch supprimée.
 *
 * `Storage::fake('public')` enracine le disque factice dans
 * `storage/framework/testing/disks/public` — un chemin PARTAGÉ par tous les
 * processus de la machine — et commence par VIDER ce répertoire. Deux suites
 * simultanées s'arrachaient donc les fichiers l'une sous l'autre : mesuré,
 * `MediaDeleteTest` (« Unable to find a file or directory at path
 * [1/pic.jpg] »), `PropertyResourceRawFlagTest` (« Can't write image to path.
 * Directory does not exist. ») et `DataExportTest` rougissaient tandis que
 * plus aucun test de recherche ne bronchait.
 *
 * Laravel sait déjà isoler ce répertoire : `Storage::fake()` suffixe la racine
 * avec `ParallelTesting::token()`, qui se lit dans `$_SERVER['TEST_TOKEN']`.
 * Il suffisait de le poser.
 */
class FakeDiskIsolationTest extends TestCase
{
    public function test_faked_disks_are_rooted_in_a_per_process_directory(): void
    {
        $root = rtrim(Storage::fake('public')->path(''), DIRECTORY_SEPARATOR);

        $this->assertStringEndsWith(
            'disks'.DIRECTORY_SEPARATOR.'public_test_'.TestProcessToken::value(),
            $root,
        );
    }

    /**
     * ⚠ `TEST_TOKEN` seul ne doit PAS faire croire à Laravel qu'on tourne en
     * mode `--parallel` : `ParallelTesting::inParallel()` exige EN PLUS
     * `LARAVEL_PARALLEL_TESTING`. Sans cette garde, les rappels de
     * `TestDatabases`/`TestCaches` s'activeraient et iraient créer des bases
     * suffixées par le token — un effet de bord qu'on n'a pas demandé.
     */
    public function test_the_token_does_not_switch_laravel_into_parallel_mode(): void
    {
        $this->assertArrayNotHasKey('LARAVEL_PARALLEL_TESTING', $_SERVER);
    }
}

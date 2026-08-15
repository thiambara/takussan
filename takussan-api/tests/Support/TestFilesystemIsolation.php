<?php

namespace Tests\Support;

use Throwable;

/**
 * Isolation des disques `Storage::fake()`, UN JEU PAR PROCESSUS DE TEST.
 *
 * `Storage::fake($disk)` enracine le disque factice dans
 * `storage/framework/testing/disks/{$disk}` — un chemin PARTAGÉ par tous les
 * processus de la machine — et commence par VIDER ce répertoire. Deux suites
 * simultanées s'arrachaient donc les fichiers l'une sous l'autre. Mesuré une
 * fois la course Meilisearch supprimée : `MediaDeleteTest`,
 * `PropertyResourceRawFlagTest` et `DataExportTest` rougissaient encore, dans
 * les deux processus, sur des messages de fichier manquant.
 *
 * Laravel sait déjà isoler cette racine : `Storage::fake()` la suffixe avec
 * `ParallelTesting::token()`, qu'il lit dans `$_SERVER['TEST_TOKEN']`. On se
 * contente donc de poser le jeton.
 *
 * ⚠ On ne pose PAS `LARAVEL_PARALLEL_TESTING`. `ParallelTesting::inParallel()`
 * exige les deux, et c'est ce qui garde inactifs les rappels de
 * `TestDatabases`/`TestCaches`/`TestViews` : on veut la racine isolée, pas la
 * machinerie de `--parallel` (qui irait créer des bases suffixées par le
 * jeton alors que la suite tourne sur SQLite `:memory:`).
 */
final class TestFilesystemIsolation
{
    private const DISKS_PATH = __DIR__.'/../../storage/framework/testing/disks';

    private static bool $installed = false;

    public static function install(): void
    {
        if (self::$installed) {
            return;
        }

        self::$installed = true;

        // `php artisan test --parallel` (ParaTest) pose son propre jeton par
        // worker : on ne l'écrase pas, sous peine de faire diverger la racine
        // des disques de la base de données du worker.
        if (isset($_SERVER['TEST_TOKEN'])) {
            return;
        }

        $token = TestProcessToken::value();

        putenv("TEST_TOKEN={$token}");
        $_ENV['TEST_TOKEN'] = $token;
        $_SERVER['TEST_TOKEN'] = $token;

        // Sans cela, chaque exécution laisserait derrière elle un répertoire
        // par disque factice. Même hameçon et même justification que pour les
        // index Meilisearch : couvre la fin normale ET l'erreur fatale, pas le
        // SIGKILL — d'où le nettoyage des orphelins ci-dessous.
        register_shutdown_function(static fn () => self::purge("*_test_{$token}"));
        self::purgeOrphans();
    }

    /** Répertoires laissés par une exécution qui n'a pas pu se nettoyer. */
    private static function purgeOrphans(): void
    {
        foreach (glob(self::DISKS_PATH.'/*_test_*') ?: [] as $path) {
            // Deux heures : au-delà, le répertoire ne peut plus appartenir à
            // une exécution vivante. Mieux vaut un orphelin de trop qu'un
            // répertoire arraché sous une exécution concurrente.
            if (is_dir($path) && (time() - (int) filemtime($path)) > 7200) {
                self::remove($path);
            }
        }
    }

    private static function purge(string $pattern): void
    {
        foreach (glob(self::DISKS_PATH.'/'.$pattern) ?: [] as $path) {
            self::remove($path);
        }
    }

    private static function remove(string $path): void
    {
        try {
            $items = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator($path, \FilesystemIterator::SKIP_DOTS),
                \RecursiveIteratorIterator::CHILD_FIRST,
            );

            foreach ($items as $item) {
                $item->isDir() ? @rmdir($item->getPathname()) : @unlink($item->getPathname());
            }

            @rmdir($path);
        } catch (Throwable) {
            // Le nettoyage ne doit jamais faire échouer une exécution.
        }
    }
}

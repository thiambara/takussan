<?php

namespace Tests\Unit\Testing;

use Illuminate\Support\Facades\Storage;
use Tests\Support\TestProcessToken;
use Tests\TestCase;

/**
 * La SECONDE cause de non-déterminisme, découverte en rejouant l'épreuve des deux
 * suites parallèles une fois la course Meilisearch supprimée (D-44).
 *
 * `Storage::fake('public')` enracine le disque factice dans
 * `storage/framework/testing/disks/public` — un chemin PARTAGÉ par tous les
 * processus de la machine — et commence par VIDER ce répertoire. Deux suites
 * simultanées s'arrachaient les fichiers l'une sous l'autre.
 *
 * ⚠ CE QUI A CHANGÉ EN PHASE 2, et pourquoi les anciennes assertions ont disparu.
 * Elles affirmaient que le jeton vaut EXACTEMENT `TestProcessToken::value()` et que
 * `LARAVEL_PARALLEL_TESTING` est absent — deux affirmations que `--parallel` rend
 * fausses par construction. Or les deux jetons ne répondent pas à la même question :
 *
 *   · `ParallelTesting::token()` (1, 2… N) isole les WORKERS ENTRE EUX ;
 *   · `TestProcessToken` (pid + aléa) isole les EXÉCUTIONS SIMULTANÉES entre elles.
 *
 * Élire le premier, c'est redonner `public_test_1` à deux agents à la fois — la
 * panne d'origine. Ils sont donc COMPOSÉS, et ce que ces tests gardent désormais est
 * la propriété qui compte réellement : la racine est unique par (exécution, worker),
 * dans les DEUX modes.
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

    public function test_the_token_always_carries_the_per_run_discriminant(): void
    {
        $this->assertStringStartsWith(
            TestProcessToken::runDiscriminant(),
            TestProcessToken::value(),
            'le discriminant PAR EXÉCUTION doit survivre au mode parallèle : sans lui, '
            .'deux agents obtiennent le même jeton et se détruisent mutuellement',
        );
    }

    public function test_the_worker_index_is_appended_only_in_parallel_mode(): void
    {
        $inParallel = isset($_SERVER['LARAVEL_PARALLEL_TESTING']);

        $this->assertSame(
            $inParallel,
            str_contains(TestProcessToken::value(), '_'),
            $inParallel
                ? 'en mode parallèle, l\'index du worker doit être présent'
                : 'hors mode parallèle, il n\'y a pas de worker à distinguer',
        );
    }
}

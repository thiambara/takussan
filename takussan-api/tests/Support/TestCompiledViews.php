<?php

namespace Tests\Support;

use Illuminate\Contracts\Config\Repository;
use Tests\CreatesApplication;

/**
 * La QUATRIÈME ressource partagée par machine — et la seule qui ne vivait pas
 * dans un worker (D-49, TCK-322).
 *
 * ## Ce qui entrait en collision, nommé avant d'être corrigé
 *
 * `Illuminate\Testing\Concerns\TestViews::bootTestViews()` enregistre trois
 * rappels de `ParallelTesting`. Le premier — `setUpProcess` — crée le répertoire
 * des vues compilées d'un worker :
 *
 *     TestViews.php:24-28    File::ensureDirectoryExists($this->parallelSafeCompiledViewPath())
 *     TestViews.php:47-58    <view.compiled>/test_<ParallelTesting::token()>
 *     Filesystem.php:643     ensureDirectoryExists() — is_dir() PUIS makeDirectory()
 *     Filesystem.php:662     return mkdir($path, $mode, $recursive);   ← sans @, sans force
 *
 * Concrètement : `storage/framework/views/test_1` … `test_8`.
 *
 * **Ce rappel ne tourne PAS dans un worker.** Il tourne dans le processus PARENT
 * de ParaTest, une fois par emplacement de worker, depuis
 * `RunsInParallel::execute()` → `forEachProcess()` → `callSetUpProcessCallbacks()`
 * — et `forEachProcess()` pose lui-même le jeton, `ParallelTesting::resolveTokenUsing(fn () => $token)`
 * avec `$token` = 1, 2… N. **Le jeton composé de TCK-321 n'y est donc pour rien :
 * il vit dans `tests/bootstrap.php`, que le parent n'exécute jamais.** C'est
 * pourquoi l'exécution A passait et la B mourait *avant le premier test*.
 *
 * Deux exécutions simultanées demandent donc exactement les mêmes huit chemins, et
 * `ensureDirectoryExists()` est un `is_dir()` suivi d'un `mkdir()` — non atomique,
 * et sans `force`, donc `mkdir()` LÈVE au lieu de rendre `false`. Le perdant de la
 * course meurt sur `mkdir(): File exists`.
 *
 * Le même chemin porte un second danger, silencieux celui-là : le rappel
 * `tearDownProcess` fait `File::deleteDirectory($path)`. L'exécution qui finit la
 * première effaçait les vues compilées de l'autre, en pleine course.
 *
 * `--tmp-dir` ne pouvait rien y faire : ce répertoire-là n'est pas celui de
 * ParaTest, c'est celui de l'application.
 *
 * ## Le correctif
 *
 * On ne peut pas rendre `ensureDirectoryExists()` atomique — il est dans le
 * framework. On rend le CHEMIN unique par exécution, un cran au-dessus : le parent
 * enracine `view.compiled` dans `<storage/framework/views>/run_<discriminant>`
 * avant que le moindre rappel ne s'exécute, et les huit `test_<worker>` naissent
 * dessous. Deux exécutions ne se croisent plus — ni à la création, ni à la
 * suppression.
 *
 * Le point d'accroche dans le parent est {@see CreatesApplication}, que
 * `RunsInParallel::createApplication()` consulte par `trait_exists()` : c'est le
 * SEUL endroit du dépôt qui s'exécute dans ce processus-là avant les rappels.
 *
 * ⚠ Le discriminant employé est celui PAR EXÉCUTION ({@see TestProcessToken}), pas
 * le jeton complet : dans le parent il n'y a pas de worker, et c'est justement le
 * niveau « exécution » qui manquait.
 */
final class TestCompiledViews
{
    /** Le préfixe des répertoires que cette classe possède — et les seuls qu'elle purge. */
    private const PREFIX = 'run_';

    /** Deux heures : au-delà, le répertoire ne peut plus appartenir à une exécution vivante. */
    private const AGE_ORPHELIN = 7200;

    private static bool $installed = false;

    /**
     * Enracine les vues compilées dans un répertoire propre à CETTE exécution.
     *
     * Prend un dépôt de configuration et non l'application : c'est tout ce dont le
     * correctif a besoin, et c'est ce qui rend la propriété vérifiable par un test
     * sans amorcer une seconde application dans le processus courant — un amorçage
     * qui reposerait la racine des façades sous le test en cours.
     *
     * Idempotent : `createApplication()` est appelé 2N fois par exécution (N pour
     * les `setUpProcess`, N pour les `tearDownProcess`), sur une application neuve
     * à chaque fois. Le hameçon d'extinction, lui, ne doit être posé qu'une fois.
     */
    public static function install(Repository $config): void
    {
        $base = (string) $config->get('view.compiled', '');

        // Même garde que `TestViews::parallelSafeCompiledViewPath()` : sans chemin
        // compilé configuré, il n'y a rien à isoler et le framework ne créera rien.
        if ($base === '') {
            return;
        }

        $path = self::pathFor($base);

        // `force` — donc `@mkdir` : ce chemin est unique par exécution, mais il est
        // demandé 2N fois par la même. Échouer sur « il existe déjà » serait
        // reproduire, un étage plus bas, le défaut que cette classe corrige.
        @mkdir($path, 0755, true);

        $config->set('view.compiled', $path);

        if (self::$installed) {
            return;
        }

        self::$installed = true;

        // Couvre la fin normale ET l'erreur fatale, pas le SIGKILL — d'où la purge
        // des orphelins, même politique et même seuil que {@see TestFilesystemIsolation}.
        register_shutdown_function(static fn () => TestDirectory::removeRecursively($path));
        self::purgeOrphans($base);
    }

    /** Le répertoire des vues compilées de CETTE exécution, sous `$base`. */
    public static function pathFor(string $base): string
    {
        return rtrim($base, '/\\').DIRECTORY_SEPARATOR.self::PREFIX.TestProcessToken::runDiscriminant();
    }

    /** Répertoires laissés par une exécution qui n'a pas pu se nettoyer. */
    private static function purgeOrphans(string $base): void
    {
        foreach (glob(rtrim($base, '/\\').DIRECTORY_SEPARATOR.self::PREFIX.'*') ?: [] as $path) {
            // Mieux vaut un orphelin de trop qu'un répertoire arraché sous une
            // exécution concurrente — c'est précisément la panne qu'on solde ici.
            if (is_dir($path) && (time() - (int) filemtime($path)) > self::AGE_ORPHELIN) {
                TestDirectory::removeRecursively($path);
            }
        }
    }
}

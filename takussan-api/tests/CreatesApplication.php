<?php

namespace Tests;

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Foundation\Application;
use Tests\Support\TestCompiledViews;

/**
 * Le SEUL point d'accroche du dépôt dans le processus PARENT de ParaTest.
 *
 * ⚠ **Ce trait n'est utilisé nulle part dans ce dépôt, et le supprimer ne casse
 * aucun `use`.** Il est trouvé par `trait_exists()` — `Illuminate\Testing\Concerns\RunsInParallel::createApplication()`,
 * ligne 168 — puis appliqué à une classe anonyme que le framework instancie
 * lui-même. Sans lui, le framework retombe sur son propre chemin (`require
 * bootstrap/app.php` + `bootstrap()`), qui est exactement ce que fait la méthode
 * ci-dessous, moins l'isolation.
 *
 * **Pourquoi ici plutôt que dans `tests/bootstrap.php`.** Ce dernier est le
 * bootstrap PHPUnit : il ne s'exécute que dans les workers. Le parent de ParaTest
 * est un autre processus (`vendor/brianium/paratest/bin/paratest`), et c'est LUI
 * qui crée les répertoires de vues compilées avant le premier test — la collision
 * de D-49. Le jeton composé de TCK-321, posé dans `tests/bootstrap.php`, ne
 * pouvait donc pas l'atteindre : c'est pourquoi l'une des deux exécutions
 * simultanées passait et l'autre mourait à l'amorçage.
 *
 * Ce que ce trait ajoute au chemin par défaut tient en une ligne, et
 * {@see TestCompiledViews} porte le raisonnement complet.
 *
 * ⚠ **Sa disparition serait SILENCIEUSE** : le framework se rabattrait sur son
 * chemin par défaut, tout resterait vert pour un agent seul, et la collision ne
 * reviendrait que le jour où deux agents parallélisent en même temps.
 * `tests/Unit/Testing/CompiledViewIsolationTest.php` garde les trois maillons —
 * ce trait, son appel, et le fait que le framework le consulte encore.
 */
trait CreatesApplication
{
    public function createApplication(): Application
    {
        $app = require __DIR__.'/../bootstrap/app.php';

        $app->make(Kernel::class)->bootstrap();

        TestCompiledViews::install($app['config']);

        return $app;
    }
}

<?php

namespace Tests\Unit\Testing;

use Illuminate\Config\Repository;
use Illuminate\Testing\Concerns\RunsInParallel;
use Illuminate\Testing\Concerns\TestViews;
use ReflectionMethod;
use Tests\CreatesApplication;
use Tests\Support\TestCompiledViews;
use Tests\Support\TestDirectory;
use Tests\Support\TestProcessToken;
use Tests\TestCase;

/**
 * La QUATRIÈME ressource partagée par machine (D-49, TCK-322) — celle qui, seule
 * des quatre, ne vit pas dans un worker mais dans le processus PARENT de ParaTest.
 *
 * Deux `php artisan test --parallel` simultanés : l'un passait, **l'autre mourait
 * avant le premier test** sur `mkdir(): File exists`. Le raisonnement complet est
 * dans {@see TestCompiledViews} ; ce que ces tests gardent, c'est la CHAÎNE, parce
 * qu'elle a trois maillons et qu'aucun des trois ne se signale en cassant.
 *
 * ⚠ **La panne d'origine était invisible pour un agent seul, et le resterait.**
 * Un test qui n'affirmerait que « le répertoire est isolé » passerait au vert avec
 * le correctif retiré, tant qu'une seule exécution tourne. D'où les gardes 2 à 4,
 * qui visent les trois façons dont ce correctif peut se perdre : on efface le
 * trait, on efface son appel, ou le framework cesse de le consulter.
 */
class CompiledViewIsolationTest extends TestCase
{
    /**
     * GARDE 1 — la propriété elle-même. Deux exécutions simultanées ne peuvent pas
     * demander le même répertoire, puisque le discriminant les sépare.
     */
    public function test_the_compiled_view_path_is_rooted_in_a_per_run_directory(): void
    {
        $base = sys_get_temp_dir().'/tck322_'.bin2hex(random_bytes(4));
        mkdir($base, 0755, true);

        try {
            $config = new Repository(['view' => ['compiled' => $base]]);

            TestCompiledViews::install($config);

            $isole = $config->get('view.compiled');

            $this->assertNotSame($base, $isole, 'sans déplacement, les deux exécutions partagent le répertoire');
            $this->assertStringStartsWith($base.DIRECTORY_SEPARATOR, $isole);
            $this->assertStringContainsString(
                TestProcessToken::runDiscriminant(),
                $isole,
                'le chemin doit porter le discriminant PAR EXÉCUTION : c\'est lui, et lui seul, '
                .'qui sépare deux agents qui parallélisent en même temps',
            );
            $this->assertDirectoryExists($isole, 'le rappel `setUpProcess` du framework crée dessous, il faut donc que le dessus existe');
        } finally {
            TestDirectory::removeRecursively($base);
        }
    }

    /**
     * GARDE 2 — le point d'accroche existe et appelle l'isolation.
     *
     * ⚠ **Honnête sur sa portée** : c'est une recherche de jeton dans le source, pas
     * une preuve d'exécution (dette D-23). Amorcer réellement une seconde
     * application ici reposerait la racine des façades sous le test en cours, ce qui
     * coûterait plus cher que ce que la garde rapporte. C'est un cliquet contre la
     * régression franche — le trait effacé, ou son appel retiré — et il est posé
     * parce que cette régression-là serait AUTREMENT SILENCIEUSE : le framework se
     * rabattrait sur son chemin par défaut et tout resterait vert pour un agent seul.
     */
    public function test_the_parent_process_hook_exists_and_installs_the_isolation(): void
    {
        $this->assertTrue(
            trait_exists(CreatesApplication::class),
            'RunsInParallel::createApplication() cherche ce trait par trait_exists() : '
            .'sans lui, le parent de ParaTest reprend son chemin par défaut, sans isolation',
        );

        $methode = new ReflectionMethod(CreatesApplication::class, 'createApplication');
        $source = $this->sourceDe($methode);

        $this->assertStringContainsString(
            'TestCompiledViews::install',
            $source,
            'le trait existe mais n\'isole plus rien — c\'est la panne de D-49 sans son symptôme',
        );
    }

    /**
     * GARDE 3 — le framework consulte encore ce point d'accroche.
     *
     * C'est le maillon qu'AUCUN test du dépôt ne pouvait voir, et celui que l'AC4 du
     * ticket vise nommément : *la correction se perdra au prochain changement
     * d'outil.* Le jour où Laravel cesse de chercher `\Tests\CreatesApplication`,
     * notre trait devient du code mort et la collision revient sans qu'une seule
     * ligne du dépôt n'ait bougé.
     */
    public function test_the_framework_still_consults_that_hook(): void
    {
        $source = $this->sourceDe(new ReflectionMethod(RunsInParallel::class, 'createApplication'));

        $this->assertStringContainsString(
            'Tests\CreatesApplication',
            $source,
            'RunsInParallel::createApplication() ne consulte plus le trait du dépôt : '
            .'l\'isolation des vues compilées doit être RÉ-ACCROCHÉE ailleurs (cf. TCK-322), '
            .'sans quoi deux exécutions --parallel simultanées se remettront à se tuer',
        );
    }

    /**
     * GARDE 4 — le défaut amont est toujours là, donc le contournement se justifie
     * toujours.
     *
     * Une garde qui ne dit que « mon correctif est en place » ne dit jamais quand le
     * retirer. Celle-ci rougit le jour où le framework cesse de dériver le chemin du
     * seul `ParallelTesting::token()` — c'est-à-dire le jour où il isole lui-même les
     * exécutions, et où tout ce dispositif devient du poids mort à supprimer.
     */
    public function test_the_upstream_path_still_depends_only_on_the_worker_token(): void
    {
        $source = $this->sourceDe(new ReflectionMethod(TestViews::class, 'parallelSafeCompiledViewPath'));

        $this->assertStringContainsString('view.compiled', $source);
        $this->assertStringContainsString(
            'ParallelTesting::token()',
            $source,
            'le framework ne compose plus le chemin des vues compilées comme avant : '
            .'relire TestViews avant de conserver le contournement de TCK-322 — il est '
            .'peut-être devenu inutile, ou pire, à côté de la plaque',
        );
    }

    /** Le texte de la méthode, telle qu'elle est réellement chargée. */
    private function sourceDe(ReflectionMethod $methode): string
    {
        $fichier = $methode->getFileName();
        $this->assertIsString($fichier);

        $lignes = file($fichier);
        $this->assertIsArray($lignes);

        return implode('', array_slice(
            $lignes,
            $methode->getStartLine() - 1,
            $methode->getEndLine() - $methode->getStartLine() + 1,
        ));
    }
}

<?php

namespace Tests\Unit\Testing;

use Illuminate\Database\Console\Migrations\MigrateCommand;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\Concerns\TestDatabases;
use ReflectionMethod;
use Tests\Support\TestDatabase;
use Tests\Support\TestProcessToken;
use Tests\TestCase;

/**
 * La CINQUIÈME ressource partagée par machine (TCK-334) — la base de test elle-même,
 * et la seule que la migration PostgreSQL ait CRÉÉE plutôt que révélée.
 *
 * Le raisonnement complet est dans {@see TestDatabase}. Ce que ces gardes tiennent,
 * c'est la propriété — **un seul mécanisme nomme et crée la base, et le nom qu'il
 * compose porte le discriminant d'exécution** — parce que les DEUX façons de la perdre
 * sont muettes, chacune à sa manière :
 *
 *   · le mécanisme du framework (`Illuminate\Testing\Concerns\TestDatabases`) ne
 *     s'active que sous `--parallel` : il a suffi d'ADR-0020 pour qu'il recompose le
 *     nom une seconde fois et rende **2553 erreurs par exécution**, pendant que le
 *     mode séquentiel restait parfaitement vert ;
 *   · `MigrateCommand::createMissingMySqlOrPgsqlDatabase()` crée en douce toute base
 *     pgsql absente. Débrancher {@see TestDatabase::ensureCreated()} ne fait donc
 *     rougir AUCUN test : il laisse seulement derrière lui des bases que plus rien
 *     ne réclame. Mesuré le 2026-08-22 : 129 sur cette machine, aucune horodatée.
 *
 * *Une garde qui n'affirme que « la base est isolée » serait verte dans les deux cas.*
 */
class TestDatabaseIsolationTest extends TestCase
{
    /**
     * ⚠ `RefreshDatabase` N'EST PAS DÉCORATIF ICI, ET SON ABSENCE A RENDU CES GARDES
     * AVEUGLES À LEUR PROPRE PANNE — mesuré par ablation le 2026-08-22.
     *
     * `TestDatabases::setUpTestCase()` (lignes 46-75) ne recompose le nom de la base
     * que pour les classes qui emploient l'un de ses quatre traits — `RefreshDatabase`,
     * `DatabaseMigrations`, `DatabaseTransactions`, `DatabaseTruncation`. Sans lui, la
     * GARDE 2 restait verte AVEC la neutralisation retirée : elle gardait une propriété
     * que rien ne menaçait dans cette classe-là.
     *
     * *Une garde doit se placer là où le mécanisme qu'elle surveille s'exécute.*
     */
    use RefreshDatabase;

    /**
     * GARDE 1 — la propriété. Deux exécutions simultanées ne peuvent pas demander la
     * même base, puisque le discriminant d'exécution les sépare.
     */
    public function test_the_connected_database_carries_the_per_run_discriminant(): void
    {
        $nom = (string) DB::getConfig('database');

        $this->assertStringContainsString(
            TestProcessToken::runDiscriminant(),
            $nom,
            'le nom de base doit porter le discriminant PAR EXÉCUTION : c\'est lui, et lui '
            .'seul, qui sépare deux agents qui lancent la suite en même temps',
        );
    }

    /**
     * GARDE 2 — **un seul** mécanisme compose ce nom.
     *
     * C'est l'assertion qui rougit sur la panne d'ADR-0020, et elle porte sur la forme
     * observable plutôt que sur l'interrupteur : le framework recollait `_test_<jeton>`
     * au nom déjà engendré, et la connexion pointait sur une base
     * `takussan_test_<jeton>_test_<jeton>` que personne ne créait jamais.
     */
    public function test_exactly_one_mechanism_composes_the_name(): void
    {
        $nom = (string) DB::getConfig('database');

        $this->assertSame(
            TestDatabase::name(),
            $nom,
            'la connexion ne pointe pas sur la base engendrée par le dépôt : un SECOND '
            .'mécanisme a renommé la base sous elle (cf. TCK-334)',
        );

        $this->assertSame(
            1,
            substr_count($nom, '_test_'),
            'le nom porte deux fois le motif de suffixation : c\'est la signature exacte '
            .'de la double composition — `takussan_test_<jeton>_test_<jeton>`',
        );
    }

    /**
     * GARDE 3 — la base a bien été créée PAR LE DÉPÔT, et non par le framework.
     *
     * C'est la seule différence observable entre les deux créateurs, et c'est celle qui
     * compte : `COMMENT ON DATABASE` porte l'horodatage dont {@see TestDatabase} a
     * besoin pour balayer les orphelines d'une exécution tuée par `SIGKILL`. Une base
     * créée par `MigrateCommand` n'en porte aucun, et le balayage s'abstient
     * délibérément dans ce cas — elle est donc perdue pour toujours.
     *
     * ⚠ **Cette garde est la seule qui voie la régression du 2026-08-22.** Retirer
     * l'appel de `Tests\TestCase::createApplication()` laisse toute la suite verte.
     */
    public function test_the_database_was_created_and_stamped_by_the_repository(): void
    {
        $horodatage = DB::selectOne(
            "select shobj_description(oid, 'pg_database') as stamp
             from pg_database where datname = current_database()"
        )?->stamp;

        $this->assertNotNull(
            $horodatage,
            'la base de ce processus n\'est pas horodatée : elle a donc été créée par '
            .'`MigrateCommand::createMissingMySqlOrPgsqlDatabase()`, pas par '
            .'`TestDatabase::ensureCreated()`. Rien ne la supprimera, et le balayage des '
            .'orphelines ne pourra jamais la réclamer (cf. TCK-334)',
        );

        $this->assertGreaterThan(
            time() - 86400,
            (int) $horodatage,
            'l\'horodatage n\'est pas celui de cette exécution',
        );
    }

    /**
     * GARDE 4 — le point d'accroche est en place, dans la classe qui sert RÉELLEMENT
     * aux processus de test.
     *
     * `Tests\CreatesApplication` a porté cet appel jusqu'au 2026-08-22, et ce trait
     * n'est lu que par le processus PARENT de ParaTest : l'appel n'a donc jamais
     * tourné dans un test. Vérifier la classe est ici tout l'objet de la garde.
     */
    public function test_the_hook_lives_in_the_base_class_tests_actually_use(): void
    {
        $methode = new ReflectionMethod(TestCase::class, 'createApplication');

        $this->assertSame(
            TestCase::class,
            $methode->getDeclaringClass()->getName(),
            '`Tests\TestCase` ne surcharge plus `createApplication()` : la création de la '
            .'base retombe sur `MigrateCommand`, en silence',
        );

        $this->assertStringContainsString(
            'TestDatabase::ensureCreated',
            $this->sourceDe($methode),
            'le point d\'accroche existe mais ne crée plus rien — la panne de TCK-334 '
            .'sans son symptôme',
        );
    }

    /**
     * GARDE 5 — les deux défauts amont sont toujours là, donc le dispositif se justifie
     * toujours.
     *
     * Une garde qui ne dit que « mon correctif est en place » ne dit jamais quand le
     * retirer. Celle-ci rougit le jour où le framework cesse de recomposer le nom, ou
     * cesse de créer les bases manquantes — c'est-à-dire le jour où l'un des deux
     * contournements devient du poids mort à supprimer.
     */
    public function test_both_upstream_mechanisms_are_still_there(): void
    {
        $this->assertStringContainsString(
            '_test_',
            $this->sourceDe(new ReflectionMethod(TestDatabases::class, 'testDatabase')),
            'le framework ne recompose plus le nom de la base : relire `TestDatabases` '
            .'avant de conserver la neutralisation de TCK-334',
        );

        $this->assertStringContainsString(
            'CREATE DATABASE',
            $this->sourceDe(new ReflectionMethod(MigrateCommand::class, 'createMissingMySqlOrPgsqlDatabase')),
            'le framework ne crée plus les bases manquantes : la perte du point '
            .'d\'accroche cesserait d\'être silencieuse, et la GARDE 3 perdrait sa raison '
            .'d\'être — la relire avant de la retirer',
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

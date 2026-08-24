<?php

namespace Tests\Support;

use Illuminate\Contracts\Config\Repository;
use PDO;
use Tests\CreatesApplication;
use Tests\TestCase;
use Throwable;

/**
 * La CINQUIÈME ressource partagée par machine — et la seule que la migration vers
 * PostgreSQL CRÉE plutôt qu'elle ne révèle.
 *
 * Sous SQLite `:memory:`, la base de test n'était pas une ressource partagée : chaque
 * processus PHP avait la sienne, sans que personne ait eu à le décider. Sur PostgreSQL,
 * tous les processus de la machine parlent au MÊME serveur et, sans ce fichier, à la
 * MÊME base. Deux exécutions simultanées — deux agents, ou `php artisan test` lancé
 * deux fois — se détruisent alors mutuellement : le `migrate:fresh` de `RefreshDatabase`
 * de l'une vide les tables sous l'autre, qui rougit sur une assertion métier
 * parfaitement juste, en accusant le code applicatif.
 *
 * C'est exactement la panne D-44, sur une autre ressource.
 *
 * ## ⚠ TROIS mécanismes nommaient ou créaient cette base — mesuré le 2026-08-22 (TCK-334)
 *
 * Ce fichier a été écrit en pensant qu'il serait le seul. Il ne l'était pas, et les deux
 * autres ne se signalaient qu'en `--parallel` :
 *
 *   1. **celui-ci** — nomme (`install()`), crée, horodate, supprime et balaie ;
 *   2. **`Illuminate\Testing\Concerns\TestDatabases`**, actif sous `--parallel` seul. Il
 *      RECOMPOSE le nom : `TestDatabases::testDatabase()` (lignes 198-209) rend
 *      `$database.'_test_'.ParallelTesting::token()` à partir du nom DÉJÀ engendré ici.
 *      D'où `takussan_test_<jeton>_test_<jeton>` — suffixé deux fois, jamais créé, et
 *      **2553 erreurs par exécution** depuis ADR-0020 ;
 *   3. **`MigrateCommand::createMissingMySqlOrPgsqlDatabase()`** (ligne 275), qui crée
 *      en silence toute base pgsql absente au premier `migrate`. C'est LUI qui faisait
 *      passer le mode séquentiel : {@see ensureCreated()} n'était accrochée qu'à
 *      {@see CreatesApplication}, que seul le processus PARENT de ParaTest
 *      emploie — jamais un processus de test. Elle n'a donc **jamais tourné dans un
 *      test**, et rien de ce qu'elle promet ne s'appliquait : ni l'horodatage, ni la
 *      suppression en fin d'exécution, ni le balayage. Mesuré le 2026-08-22 sur cette
 *      machine : **129 bases orphelines**, toutes sans horodatage, donc à jamais hors
 *      de portée de {@see sweepOrphans()}, qui s'abstient délibérément dans ce cas.
 *
 * *Un mécanisme d'isolation qui n'est jamais appelé n'échoue pas : un autre le couvre,
 * plus mal, et le vert reste vert.* C'est le même enseignement que les trois ablations
 * de `BaseFormRequest` (cf. `takussan-api/CLAUDE.md` § Validation).
 *
 * ## Il n'y en a plus qu'un, et c'est celui-ci
 *
 *   · le n°2 est ÉTEINT par {@see neutralizeFrameworkMechanism()}, avec son propre
 *     interrupteur documenté (`--without-databases`) ;
 *   · le n°3 est PRÉEMPTÉ : la base existe avant le premier `migrate`, donc
 *     `createMissingMySqlOrPgsqlDatabase()` ne s'exécute plus. Il reste en embuscade,
 *     et c'est précisément ce qui rendrait la perte du point d'accroche SILENCIEUSE —
 *     d'où `tests/Unit/Testing/TestDatabaseIsolationTest.php`, qui garde la propriété
 *     observable qui les sépare : **une base créée ici porte un horodatage, une base
 *     créée par le framework n'en porte pas.**
 *
 * ## Deux points d'accroche, et pourquoi ils sont deux
 *
 *   1. {@see install()} — depuis `tests/bootstrap.php`, AVANT toute application Laravel.
 *      Elle ne fait que POSER le nom dans l'environnement : le dépôt de variables de
 *      Dotenv est immuable (`safeLoad()` n'écrase jamais une valeur déjà posée), si bien
 *      que cette valeur l'emporte sur le `DB_DATABASE` du `.env` du développeur comme
 *      sur celui de la CI. Elle ne peut RIEN faire de plus : à ce moment-là, ni l'hôte,
 *      ni le port, ni le mot de passe ne sont connus.
 *   2. {@see ensureCreated()} — depuis {@see TestCase::createApplication()}, donc avec
 *      une application bootée et sa configuration, dans CHAQUE processus de test.
 *      C'est le seul endroit qui s'exécute APRÈS que la connexion soit configurée et
 *      AVANT `setUpTraits()`, donc avant que `RefreshDatabase` ne tente de migrer.
 *      Même raisonnement que {@see TestSearchIndex::registerCleanup()}, qui attend
 *      d'être appelée depuis un endroit qui connaît l'hôte et la clé.
 *
 *      ⚠ Elle était accrochée à {@see CreatesApplication}, et c'était l'erreur :
 *      `Tests\TestCase` n'emploie PAS ce trait — il hérite du `createApplication()` du
 *      framework (`Illuminate\Foundation\Testing\TestCase`, ligne 45). Ce trait n'est
 *      lu que par `RunsInParallel::createApplication()`, dans le parent de ParaTest.
 *
 * ## L'âge d'une base, et pourquoi il est écrit à la main
 *
 * `pg_database` ne porte AUCUNE date de création — contrairement aux index Meilisearch,
 * dont `getCreatedAt()` donne la leur. Le balayage des orphelines, filet des exécutions
 * tuées par `SIGKILL` ou `Ctrl-C` que `register_shutdown_function` ne couvre pas, n'a
 * donc rien à lire. On l'écrit nous-mêmes : `COMMENT ON DATABASE` stocke l'horodatage et
 * `shobj_description()` le relit. Aucun droit de superutilisateur requis.
 *
 * ## Ce que ce fichier NE fait pas
 *
 * Il ne se replie PAS sur la base partagée quand la création échoue. Sans `CREATEDB`
 * (cf. `docker/pgsql-init.sql`), la création lève, et c'est voulu : un échec bruyant vaut
 * mieux qu'un repli silencieux qui reproduirait exactement la panne qu'on ferme ici.
 * *Une isolation qui se désactive toute seule n'est pas une isolation.*
 */
final class TestDatabase
{
    /** Le motif d'un nom engendré ici — sert aussi au balayage des orphelines. */
    private const PREFIX = 'takussan_test_';

    /** Au-delà, une base préfixée ne peut plus appartenir à une exécution vivante. */
    private const ORPHAN_TTL_SECONDS = 7200;

    private static ?string $name = null;

    private static bool $created = false;

    /**
     * Engendre le nom de la base de CE processus et l'expose à `env()`.
     *
     * Appelée depuis `tests/bootstrap.php`.
     */
    public static function install(): string
    {
        if (self::$name !== null) {
            return self::$name;
        }

        self::neutralizeFrameworkMechanism();

        $name = self::PREFIX.TestProcessToken::value();

        putenv("DB_DATABASE={$name}");
        $_ENV['DB_DATABASE'] = $name;
        $_SERVER['DB_DATABASE'] = $name;

        return self::$name = $name;
    }

    public static function name(): string
    {
        return self::$name ?? self::install();
    }

    /**
     * Éteint le mécanisme de bases de test du FRAMEWORK, dans le processus courant.
     *
     * `Illuminate\Testing\Concerns\TestDatabases` ne s'active que sous `--parallel`, et
     * il ne sait pas qu'un nom lui a déjà été donné : il reprend `DB_DATABASE` — donc le
     * nom engendré ici — et lui recolle `_test_<jeton>`. La base ainsi nommée n'est
     * jamais celle sur laquelle la connexion pointe, et TOUT rougit :
     *
     *     FATAL: database "takussan_test_12148e66e64_1" does not exist
     *     SQL: drop database if exists "takussan_test_…_1_test_…_1"
     *
     * On emploie son propre interrupteur, `LARAVEL_PARALLEL_TESTING_WITHOUT_DATABASES`
     * (`ParallelTesting::option('without_databases')`, lu dans `$_SERVER` — d'où
     * l'écriture des trois dépôts), qui est ce que pose l'option documentée
     * `artisan test --parallel --without-databases`. Le sens de cette option est
     * exactement le nôtre : *« la configuration des bases est prise en charge
     * ailleurs »*. Ce n'est donc pas un contournement, c'est la déclaration.
     *
     * ⚠ Corollaire assumé : sous ce drapeau, `--recreate-databases` et
     * `--drop-databases` deviennent inertes. Ils pilotent les bases du framework, et il
     * n'y en a plus ; les nôtres se suppriment à l'extinction du processus.
     *
     * ⚠ Appelée depuis DEUX processus — le worker ({@see install()}, via
     * `tests/bootstrap.php`) et le parent de ParaTest ({@see CreatesApplication}) —
     * parce que les rappels du framework ne vivent pas tous au même endroit :
     * `setUpTestCase` s'exécute dans le worker, `setUpProcess` / `tearDownProcess` dans
     * le parent.
     *
     * ⚠⚠ **Les deux sites sont REDONDANTS sous `--parallel`, et c'est mesuré, pas
     * supposé** (ablation du 2026-08-22) : retirer l'un OU l'autre laisse la garde
     * verte ; retirer les DEUX la fait rougir et laisse derrière elle une
     * `takussan_test_<jeton>_1_test_<jeton>_1` non horodatée. La redondance vient de ce
     * que le `putenv()` du parent est hérité par les workers que ParaTest engendre —
     * couplage réel mais non documenté, sur lequel on ne veut pas s'appuyer. Chacun des
     * deux garde donc son propre motif : le worker n'a pas à dépendre de l'héritage
     * d'environnement, et le parent est le SEUL à couvrir ses deux rappels à lui.
     */
    public static function neutralizeFrameworkMechanism(): void
    {
        putenv('LARAVEL_PARALLEL_TESTING_WITHOUT_DATABASES=1');
        $_ENV['LARAVEL_PARALLEL_TESTING_WITHOUT_DATABASES'] = '1';
        $_SERVER['LARAVEL_PARALLEL_TESTING_WITHOUT_DATABASES'] = '1';
    }

    /**
     * Crée la base du processus si elle n'existe pas, programme sa suppression, et
     * balaie au passage celles qu'une exécution tuée aurait laissées derrière elle.
     *
     * Idempotente : appelée à chaque `createApplication()` — donc potentiellement des
     * milliers de fois dans une exécution — elle n'agit qu'une fois.
     *
     * ⚠ Ne rien faire quand {@see install()} n'a pas tourné : c'est la signature du
     * processus PARENT de ParaTest, qui n'exécute pas `tests/bootstrap.php` et ne joue
     * aucun test. Y créer une base serait en créer une par exécution `--parallel`, pour
     * personne. Le parent n'a besoin que de {@see neutralizeFrameworkMechanism()}.
     */
    public static function ensureCreated(Repository $config): void
    {
        if (self::$name === null || self::$created || $config->get('database.default') !== 'pgsql') {
            return;
        }

        self::$created = true;

        $name = self::name();
        $pdo = self::maintenanceConnection($config);

        self::sweepOrphans($pdo, $name);

        $exists = $pdo
            ->query('SELECT 1 FROM pg_database WHERE datname = '.$pdo->quote($name))
            ->fetchColumn();

        if ($exists === false) {
            // `CREATE DATABASE` n'accepte ni paramètre lié ni transaction. Le nom n'est pas
            // interpolé depuis une entrée extérieure : il est engendré ici, préfixe constant
            // plus jeton hexadécimal de TestProcessToken.
            $pdo->exec('CREATE DATABASE "'.$name.'"');
            $pdo->exec('COMMENT ON DATABASE "'.$name.'" IS '.$pdo->quote((string) time()));
        }

        // Même hameçon et même justification que pour les index Meilisearch et les disques
        // factices : couvre la fin normale ET l'erreur fatale, pas le SIGKILL — d'où le
        // balayage des orphelines ci-dessus, qui rattrape le cas à l'exécution suivante.
        register_shutdown_function(static function () use ($config, $name) {
            self::drop(self::maintenanceConnection($config), $name);
        });
    }

    /**
     * Une connexion à la base de MAINTENANCE (`postgres`) — on ne peut ni créer ni
     * supprimer une base depuis elle-même.
     */
    private static function maintenanceConnection(Repository $config): PDO
    {
        /** @var array{host: string, port: string|int, username: string, password: string} $c */
        $c = $config->get('database.connections.pgsql');

        $dsn = sprintf('pgsql:host=%s;port=%s;dbname=postgres', $c['host'], $c['port']);

        return new PDO($dsn, $c['username'], $c['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);
    }

    /** Bases laissées par une exécution qui n'a pas pu se nettoyer (SIGKILL, Ctrl-C). */
    private static function sweepOrphans(PDO $pdo, string $mine): void
    {
        $cutoff = time() - self::ORPHAN_TTL_SECONDS;

        try {
            $rows = $pdo->query(
                "SELECT datname, shobj_description(oid, 'pg_database') AS stamp
                 FROM pg_database
                 WHERE datname LIKE ".$pdo->quote(self::PREFIX.'%')
            )->fetchAll(PDO::FETCH_ASSOC);
        } catch (Throwable) {
            // Le balayage ne doit jamais faire échouer une exécution : si le serveur ne
            // répond plus, la création qui suit lèvera de toute façon, et avec un message
            // qui dit la vraie cause.
            return;
        }

        foreach ($rows as $row) {
            if ($row['datname'] === $mine) {
                continue;
            }

            // Sans horodatage, on s'abstient : mieux vaut une base de trop qu'une base
            // arrachée sous une exécution concurrente vivante. Même arbitrage que
            // TestSearchIndex::sweepOrphans() pour un index sans date.
            if ($row['stamp'] === null || (int) $row['stamp'] >= $cutoff) {
                continue;
            }

            self::drop($pdo, $row['datname']);
        }
    }

    private static function drop(PDO $pdo, string $name): void
    {
        try {
            // WITH (FORCE) coupe les connexions restantes. Sans lui, un worker ParaTest tué
            // laisse une connexion ouverte et `DROP DATABASE` échoue sur « is being accessed
            // by other users » — la base survit alors à son exécution et le balayage des
            // orphelines devient le seul recours, deux heures plus tard.
            $pdo->exec('DROP DATABASE IF EXISTS "'.$name.'" WITH (FORCE)');
        } catch (Throwable) {
            // Le nettoyage ne doit jamais faire échouer une exécution.
        }
    }
}

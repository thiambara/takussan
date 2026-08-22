<?php

namespace Tests\Support;

use Illuminate\Contracts\Config\Repository;
use PDO;
use Tests\CreatesApplication;
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
 * C'est exactement la panne D-44, sur une autre ressource. On la ferme AVANT qu'elle
 * ne soit mesurée, pour une fois — les quatre précédentes ont toutes été trouvées en
 * poursuivant des rouges qui changeaient d'ensemble à chaque exécution.
 *
 * ## Deux points d'accroche, et pourquoi ils sont deux
 *
 *   1. {@see install()} — depuis `tests/bootstrap.php`, AVANT toute application Laravel.
 *      Elle ne fait que POSER le nom dans l'environnement : le dépôt de variables de
 *      Dotenv est immuable (`safeLoad()` n'écrase jamais une valeur déjà posée), si bien
 *      que cette valeur l'emporte sur le `DB_DATABASE` du `.env` du développeur comme
 *      sur celui de la CI. Elle ne peut RIEN faire de plus : à ce moment-là, ni l'hôte,
 *      ni le port, ni le mot de passe ne sont connus.
 *   2. {@see ensureCreated()} — depuis {@see CreatesApplication::createApplication()},
 *      donc avec une application bootée et sa configuration. C'est le seul endroit qui
 *      s'exécute APRÈS que la connexion soit configurée et AVANT `setUpTraits()`, donc
 *      avant que `RefreshDatabase` ne tente de migrer. Même raisonnement que
 *      {@see TestSearchIndex::registerCleanup()}, qui attend d'être appelée depuis un
 *      endroit qui connaît l'hôte et la clé.
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
     * Crée la base du processus si elle n'existe pas, programme sa suppression, et
     * balaie au passage celles qu'une exécution tuée aurait laissées derrière elle.
     *
     * Idempotente : appelée à chaque `createApplication()` — donc potentiellement des
     * milliers de fois dans une exécution — elle n'agit qu'une fois.
     */
    public static function ensureCreated(Repository $config): void
    {
        if (self::$created || $config->get('database.default') !== 'pgsql') {
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

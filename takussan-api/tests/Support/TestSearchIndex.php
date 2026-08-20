<?php

namespace Tests\Support;

use DateTimeImmutable;
use Meilisearch\Client;
use Meilisearch\Contracts\IndexesQuery;
use Throwable;

/**
 * Isolation des index Meilisearch, UN JEU PAR PROCESSUS DE TEST.
 *
 * `phpunit.xml` figeait `SCOUT_PREFIX` au littéral `testing_`. Deux exécutions
 * simultanées de la suite sur la même machine — deux agents, ou simplement
 * `php artisan test` lancé deux fois — écrivaient donc dans les MÊMES index :
 * le `setUp` de l'une purgeait ce que l'autre venait d'indexer. Mesuré :
 * 10 puis 8 tests rouges sur des ensembles DIFFÉRENTS, sans qu'un fichier
 * n'ait changé entre les deux.
 *
 * `config/scout.php` clé ses `index-settings` par CLASSE DE MODÈLE (vérifié),
 * pas par nom d'index : un préfixe dynamique ne casse donc pas la
 * configuration, et `scout:sync-index-settings` la pousse sur les index
 * effectivement utilisés.
 *
 * En contrepartie, les index créés doivent être SUPPRIMÉS en fin d'exécution,
 * sinon l'instance accumulerait un jeu d'index par exécution jusqu'à
 * saturation.
 */
final class TestSearchIndex
{
    /** Le motif d'un préfixe engendré ici — sert aussi au balayage des orphelins. */
    private const PATTERN = '/^testing_[0-9a-f]+_/';

    /** Au-delà, un index préfixé « testing_ » ne peut plus appartenir à une exécution vivante. */
    private const ORPHAN_TTL_SECONDS = 7200;

    private static ?string $prefix = null;

    private static bool $cleanupRegistered = false;

    /**
     * Engendre le préfixe du processus et l'expose à `env()`.
     *
     * Appelée depuis `tests/bootstrap.php`, donc AVANT que Laravel ne
     * construise l'application : le dépôt de variables de Dotenv est
     * immuable (`safeLoad()` n'écrase jamais une valeur déjà posée), si bien
     * que cette valeur l'emporte sur le `SCOUT_PREFIX` du `.env` du
     * développeur comme sur celui de la CI.
     */
    public static function install(): string
    {
        if (self::$prefix !== null) {
            return self::$prefix;
        }

        $prefix = 'testing_'.TestProcessToken::value().'_';

        putenv("SCOUT_PREFIX={$prefix}");
        $_ENV['SCOUT_PREFIX'] = $prefix;
        $_SERVER['SCOUT_PREFIX'] = $prefix;

        return self::$prefix = $prefix;
    }

    public static function prefix(): string
    {
        return self::$prefix ?? self::install();
    }

    /**
     * Programme la suppression des index de CE processus, et balaie au passage
     * ceux qu'une exécution tuée aurait laissés derrière elle.
     *
     * Point d'accroche : `register_shutdown_function`, appelé une seule fois
     * depuis `InteractsWithMeilisearch`. Le choix se justifie sur trois points.
     *   1. C'est le seul endroit où l'on connaît l'hôte et la clé : ils
     *      viennent de `config('scout.meilisearch')`, donc d'une application
     *      Laravel bootée — ce que `tests/bootstrap.php` n'a pas encore.
     *   2. Depuis que la synchronisation Scout est coupée par défaut
     *      (cf. `Tests\TestCase`), les SEULS index créés le sont par des tests
     *      portant ce concern : y accrocher le nettoyage le rend exhaustif.
     *      Une exécution sans test de recherche ne crée rien, et n'a donc rien
     *      à nettoyer.
     *   3. `register_shutdown_function` couvre la fin normale ET l'erreur
     *      fatale, ce qu'une extension PHPUnit (`ApplicationFinished`) ne fait
     *      pas. Il ne couvre PAS `SIGKILL` ni un `Ctrl-C` — d'où le balayage
     *      des orphelins ci-dessous, qui rattrape le cas au coup suivant.
     */
    public static function registerCleanup(Client $client): void
    {
        if (self::$cleanupRegistered) {
            return;
        }

        self::$cleanupRegistered = true;

        self::sweepOrphans($client);

        $prefix = self::prefix();

        register_shutdown_function(static function () use ($client, $prefix) {
            self::deleteMatching(
                $client,
                static fn (string $uid, ?\DateTimeInterface $createdAt) => str_starts_with($uid, $prefix),
            );
        });
    }

    /** Supprime les index laissés par une exécution qui n'a pas pu se nettoyer. */
    private static function sweepOrphans(Client $client): void
    {
        $cutoff = new DateTimeImmutable('-'.self::ORPHAN_TTL_SECONDS.' seconds');
        $mine = self::prefix();

        self::deleteMatching($client, static function (string $uid, ?\DateTimeInterface $createdAt) use ($cutoff, $mine) {
            // `$mine` est un PRÉFIXE, `$uid` un nom d'index complet
            // (`testing_<token>_properties`) : la comparaison doit être un
            // `str_starts_with`, pas une égalité — laquelle n'aurait jamais
            // été vraie et aurait laissé le seul garde-fou d'âge protéger nos
            // propres index.
            if (str_starts_with($uid, $mine) || ! preg_match(self::PATTERN, $uid)) {
                return false;
            }

            // Sans date, on s'abstient : mieux vaut un index de trop qu'un
            // index arraché sous une exécution concurrente vivante.
            return $createdAt !== null && $createdAt < $cutoff;
        });
    }

    /**
     * @param  callable(string, ?\DateTimeInterface): bool  $matches
     */
    private static function deleteMatching(Client $client, callable $matches): void
    {
        try {
            $indexes = $client->getIndexes((new IndexesQuery)->setLimit(1000))->getResults();
        } catch (Throwable) {
            // Le nettoyage ne doit jamais faire échouer une exécution : si le
            // moteur ne répond plus, il n'y a de toute façon plus rien à faire.
            return;
        }

        foreach ($indexes as $index) {
            $uid = $index->getUid();

            if ($uid === null || ! $matches($uid, $index->getCreatedAt())) {
                continue;
            }

            try {
                $client->deleteIndex($uid);
            } catch (Throwable) {
                // idem
            }
        }
    }
}

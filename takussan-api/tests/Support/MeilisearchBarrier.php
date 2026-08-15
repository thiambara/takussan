<?php

namespace Tests\Support;

use Closure;

/**
 * Barrière de synchronisation devant un moteur d'indexation ASYNCHRONE.
 *
 * L'implémentation précédente vivait en ligne dans
 * `InteractsWithMeilisearch::waitForMeilisearch()` et **retournait normalement
 * quand le délai expirait** : aucune exception, aucune assertion, aucune trace.
 * Le test enchaînait sur un index à moitié construit, ce qui produit les deux
 * symptômes observés — « il manque des documents » (l'ajout n'a pas atterri) et
 * « il y en a en trop » (la suppression du `setUp` n'a pas atterri). Une
 * barrière qui abandonne en silence transforme une course en test rouge
 * ALÉATOIRE : le pire profil de panne à diagnostiquer, puisque l'ensemble des
 * tests rouges change à chaque exécution.
 *
 * Extraite ici pour être testable sans moteur : `await()` ne connaît qu'une
 * closure qui rend les tâches en attente.
 */
final class MeilisearchBarrier
{
    /**
     * Bloque jusqu'à ce que `$fetchPending` rende un tableau vide.
     *
     * @param  Closure():array<int,mixed>  $fetchPending  Rend les tâches encore `enqueued`/`processing`.
     * @param  float  $timeout  Délai maximal, en secondes.
     * @param  Closure():void|null  $sleep  Attente entre deux sondages (injectable pour les tests).
     *
     * @throws MeilisearchNotIdleException si le délai expire alors que des tâches restent.
     */
    public static function await(Closure $fetchPending, float $timeout = 10.0, ?Closure $sleep = null): void
    {
        $sleep ??= static fn () => usleep(50_000);
        $start = microtime(true);
        $deadline = $start + $timeout;

        do {
            $pending = $fetchPending();

            if ($pending === []) {
                return;
            }

            $sleep();
        } while (microtime(true) < $deadline);

        throw new MeilisearchNotIdleException(
            self::diagnostic($pending, microtime(true) - $start, $timeout)
        );
    }

    /**
     * Le message doit suffire à diagnostiquer SANS relancer : combien de
     * tâches restaient, sur quels index, et depuis combien de temps on
     * attendait.
     *
     * @param  array<int,mixed>  $pending
     */
    private static function diagnostic(array $pending, float $elapsed, float $timeout): string
    {
        $perIndex = [];

        foreach ($pending as $task) {
            $uid = self::indexUid($task) ?? '?';
            $perIndex[$uid] = ($perIndex[$uid] ?? 0) + 1;
        }

        arsort($perIndex);

        $breakdown = implode(', ', array_map(
            static fn (string $uid, int $count) => "{$uid}: {$count}",
            array_keys($perIndex),
            $perIndex,
        ));

        return sprintf(
            'Meilisearch n\'a pas vidé sa file de tâches : %d tâche(s) encore en attente après %.1f s '
            .'(plafond %.1f s) — %s. '
            .'Le test aurait lu un index à moitié construit. '
            .'Causes déjà vues : une autre exécution de la suite écrit dans la même instance, '
            .'ou la suite indexe hors des tests de recherche (la synchronisation Scout doit rester '
            .'coupée par défaut, cf. Tests\TestCase).',
            count($pending),
            $elapsed,
            $timeout,
            $breakdown,
        );
    }

    /**
     * Le SDK rend tantôt des tableaux, tantôt des objets `Task` selon
     * l'appel ; on lit l'`indexUid` sans présumer de la forme.
     */
    private static function indexUid(mixed $task): ?string
    {
        if (is_array($task)) {
            $uid = $task['indexUid'] ?? null;
        } elseif (is_object($task) && method_exists($task, 'getIndexUid')) {
            $uid = $task->getIndexUid();
        } elseif (is_object($task)) {
            $uid = $task->indexUid ?? null;
        } else {
            $uid = null;
        }

        return is_string($uid) && $uid !== '' ? $uid : null;
    }
}

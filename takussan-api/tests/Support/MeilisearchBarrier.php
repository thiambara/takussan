<?php

namespace Tests\Support;

use Closure;

/**
 * Barrière de synchronisation devant un moteur d'indexation ASYNCHRONE.
 *
 * L'implémentation d'origine vivait en ligne dans
 * `InteractsWithMeilisearch::waitForMeilisearch()` et **retournait normalement
 * quand le délai expirait** : aucune exception, aucune assertion, aucune trace.
 * Le test enchaînait sur un index à moitié construit, ce qui produit les deux
 * symptômes observés — « il manque des documents » (l'ajout n'a pas atterri) et
 * « il y en a en trop » (la suppression du `setUp` n'a pas atterri). Une
 * barrière qui abandonne en silence transforme une course en test rouge
 * ALÉATOIRE : le pire profil de panne à diagnostiquer, puisque l'ensemble des
 * tests rouges change à chaque exécution. **Ce contrat-là ne bouge pas : on
 * lève, toujours, et le message dit de quoi diagnostiquer sans relancer.**
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QUI A CHANGÉ LE 2026-08-22 (TCK-334) : LA GRANDEUR MESURÉE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * La version précédente abandonnait après N secondes de **temps mural**. Le
 * 2026-08-20, deux `php artisan test --parallel` simultanés sur la suite
 * entière ont rendu 38 et 37 erreurs, **toutes** des
 * {@see MeilisearchNotIdleException}, quand une seule exécution au même repos
 * rendait 0 échec en 108 s. La file de tâches de Meilisearch est **globale au
 * serveur** : deux suites se la partagent, chacune attend le travail de
 * l'autre, et un plafond en temps mural déclare « bloqué » un serveur qui
 * travaillait parfaitement.
 *
 * **Le compte de tâches était le mauvais signal, et c'est mesuré.** Un
 * détecteur de stagnation fondé sur « le nombre de tâches en attente ne baisse
 * plus » serait PIRE que le plafond qu'il remplace : Meilisearch traite par
 * BATCHS, donc le compte est une fonction en escalier, et la plus longue marche
 * relevée sur les 16042 tâches de l'historique du serveur (2026-08-22) dure
 * **8,30 s** — un batch d'UNE seule tâche `documentAdditionOrUpdate`, survenu
 * SANS aucune exécution concurrente. Un détecteur par le compte se serait donc
 * déclenché sur un serveur nominal.
 *
 * Le bon signal est le **BATTEMENT DU SERVEUR** : `GET /batches?limit=1` rend
 * le batch le plus récent, dont le champ `progress` est non nul et **avance**
 * tant qu'un batch tourne, puis passe à `null` une fois fini — et l'`uid`
 * change au batch suivant. L'empreinte `(uid, progress)` bouge donc dès que le
 * serveur fait quoi que ce soit, pour n'importe quel index, y compris ceux
 * d'une autre exécution de la suite. C'est exactement la propriété qu'on veut :
 * *on n'abandonne pas parce qu'on attend, on abandonne parce que le serveur ne
 * fait plus rien.*
 *
 * Le battement est injecté sur le même patron que `$fetchPending` — une
 * closure — donc cette classe reste testable sans moteur (cf. `tests/Unit/Testing/MeilisearchBarrierTest.php`).
 *
 * ⚠ **Le plafond absolu SUBSISTE, en second garde-fou.** Sans lui, on aurait
 * troqué un rouge aléatoire contre une suspension infinie — un serveur qui bat
 * sans jamais vider notre file bloquerait la suite sans rien produire, ce qui
 * est strictement pire (une commande suspendue est coupée en cours de route
 * sans rapport de test). Il ne doit JAMAIS se déclencher en régime nominal ;
 * s'il se déclenche, c'est un renseignement en soi, et le message le dit.
 */
final class MeilisearchBarrier
{
    /**
     * Secondes de SILENCE du serveur — pas d'attente — avant d'abandonner.
     *
     * Chiffre repris tel quel de l'ancien plafond en temps mural, et c'est
     * délibéré : appliqué au silence plutôt qu'à l'attente, le MÊME nombre ne
     * peut que faire attendre PLUS longtemps, jamais moins. On ne relève donc
     * aucun plafond sans mesure — l'AC4 de TCK-334 l'interdit, et un plafond
     * non mesuré est la faute d'origine de D-44.
     *
     * Il faut néanmoins qu'il couvre le pire intervalle SANS battement observé.
     * Le plus long batch de l'historique du serveur (16042 tâches, relevé le
     * 2026-08-22) dure **8,30 s** : 10 s laisse 1,70 s de marge, soit 20 %,
     * au cas où le `progress` d'un batch long resterait sur le même palier d'un
     * bout à l'autre.
     */
    public const STALL_TIMEOUT_SECONDS = 10.0;

    /**
     * Plafond absolu, second garde-fou — DÉRIVÉ, pas choisi.
     *
     * Trois mesures le composent :
     *   • la plus longue attente LÉGITIME observée à la barrière est de
     *     **0,166 s** (88 appels, `tests/Feature/Search/` entier, machine au
     *     repos à `load average` 3,2 sur 8 cœurs, 2026-08-22) ;
     *   • le plus long batch de l'historique du serveur dure **8,30 s** ;
     *   • le facteur de contention mesuré sur cette machine est de **×11**
     *     (2026-08-16, `load average` 200-258 sur 8 cœurs).
     *
     * 8,30 × 11 = 91,3 s, arrondi à la fenêtre de stagnation supérieure
     * (10 s) → **100 s**. C'est ~600 fois la pire attente légitime mesurée, et
     * cela reste sous les 108 s d'une exécution complète de la suite : un seul
     * appel à la barrière ne peut donc jamais bloquer aussi longtemps que la
     * suite entière ne met à s'exécuter.
     */
    public const ABSOLUTE_CAP_SECONDS = 100.0;

    /**
     * Bloque jusqu'à ce que `$fetchPending` rende un tableau vide.
     *
     * @param  Closure():array<int,mixed>  $fetchPending  Rend les tâches encore `enqueued`/`processing`.
     * @param  Closure():mixed|null  $fetchHeartbeat  Rend l'empreinte du dernier batch du serveur.
     *                                                `null` fait retomber la barrière sur le seul
     *                                                plafond absolu — le comportement d'avant
     *                                                TCK-334, conservé pour que l'absence de
     *                                                battement ne soit jamais une attente infinie.
     * @param  float  $stallTimeout  Secondes SANS battement du serveur avant d'abandonner.
     * @param  float  $absoluteCap  Plafond absolu, en secondes.
     * @param  Closure():void|null  $sleep  Attente entre deux sondages (injectable pour les tests).
     * @param  Closure():float|null  $now  Horloge (injectable : c'est ce qui rend les seuils
     *                                     testables sans attendre réellement dix secondes).
     *
     * @throws MeilisearchNotIdleException si le serveur cesse de battre, ou si le plafond absolu
     *                                     est atteint alors que des tâches restent.
     */
    public static function await(
        Closure $fetchPending,
        ?Closure $fetchHeartbeat = null,
        float $stallTimeout = self::STALL_TIMEOUT_SECONDS,
        float $absoluteCap = self::ABSOLUTE_CAP_SECONDS,
        ?Closure $sleep = null,
        ?Closure $now = null,
    ): void {
        $sleep ??= static fn () => usleep(50_000);
        $now ??= static fn () => microtime(true);

        $start = $now();
        $lastBeatAt = $start;
        $lastBeat = null;
        $beatSeen = false;

        while (true) {
            $pending = $fetchPending();

            if ($pending === []) {
                return;
            }

            $instant = $now();

            if ($fetchHeartbeat !== null) {
                $beat = $fetchHeartbeat();

                if (! $beatSeen || $beat !== $lastBeat) {
                    $beatSeen = true;
                    $lastBeat = $beat;
                    $lastBeatAt = $instant;
                }
            }

            $silence = $instant - $lastBeatAt;
            $elapsed = $instant - $start;

            if ($fetchHeartbeat !== null && $silence >= $stallTimeout) {
                throw new MeilisearchNotIdleException(
                    self::stalledDiagnostic($pending, $elapsed, $silence, $stallTimeout)
                );
            }

            if ($elapsed >= $absoluteCap) {
                throw new MeilisearchNotIdleException(
                    self::cappedDiagnostic($pending, $elapsed, $absoluteCap, $fetchHeartbeat !== null)
                );
            }

            $sleep();
        }
    }

    /**
     * Le serveur ne bat plus : il est bloqué, mort, ou injoignable. Ce n'est
     * PAS le cas « ça prend du temps », et le message doit le dire, sinon le
     * lecteur ira chercher la lenteur là où il y a une panne.
     *
     * @param  array<int,mixed>  $pending
     */
    private static function stalledDiagnostic(array $pending, float $elapsed, float $silence, float $stallTimeout): string
    {
        return sprintf(
            'Meilisearch N\'A PRODUIT AUCUN BATCH depuis %.1f s (seuil de stagnation %.1f s) : '
            .'le serveur ne travaille plus, il n\'est pas seulement lent. '
            .'%d tâche(s) encore en attente après %.1f s d\'attente — %s. '
            .'Le test aurait lu un index à moitié construit. '
            .'Causes déjà vues : le serveur est arrêté ou saturé au point de ne plus ordonnancer, '
            .'ou la suite indexe hors des tests de recherche (la synchronisation Scout doit rester '
            .'coupée par défaut, cf. Tests\TestCase).',
            $silence,
            $stallTimeout,
            count($pending),
            $elapsed,
            self::breakdown($pending),
        );
    }

    /**
     * Le serveur bat encore : il est VIVANT et trop lent. La cause mesurée est
     * le partage de la file — elle est globale au serveur, pas par index.
     *
     * @param  array<int,mixed>  $pending
     */
    private static function cappedDiagnostic(array $pending, float $elapsed, float $absoluteCap, bool $heartbeatWatched): string
    {
        return sprintf(
            'PLAFOND ABSOLU ATTEINT (%.1f s) : Meilisearch %s, mais n\'a pas vidé la file dans le délai. '
            .'%d tâche(s) encore en attente après %.1f s — %s. '
            .'Le test aurait lu un index à moitié construit. '
            .'Cause mesurée le 2026-08-20 (TCK-334) : la file de tâches est GLOBALE AU SERVEUR, '
            .'pas par index — deux exécutions simultanées de la suite se la partagent et se '
            .'ralentissent mutuellement. Un seul agent à la fois sur la suite entière.',
            $absoluteCap,
            $heartbeatWatched ? 'battait encore (des batchs sortaient)' : 'n\'était pas surveillé (aucun battement injecté)',
            count($pending),
            $elapsed,
            self::breakdown($pending),
        );
    }

    /**
     * Combien de tâches restaient, et sur quels index. Ce détail est la moitié
     * de la valeur du message : il distingue « c'est nous » de « c'est une
     * autre exécution ».
     *
     * @param  array<int,mixed>  $pending
     */
    private static function breakdown(array $pending): string
    {
        $perIndex = [];

        foreach ($pending as $task) {
            $uid = self::indexUid($task) ?? '?';
            $perIndex[$uid] = ($perIndex[$uid] ?? 0) + 1;
        }

        arsort($perIndex);

        return implode(', ', array_map(
            static fn (string $uid, int $count) => "{$uid}: {$count}",
            array_keys($perIndex),
            $perIndex,
        ));
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

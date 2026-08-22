<?php

namespace Tests\Unit\Testing;

use PHPUnit\Framework\TestCase;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\Support\MeilisearchBarrier;
use Tests\Support\MeilisearchNotIdleException;

/**
 * La barrière de synchronisation du harnais de test.
 *
 * Elle a longtemps ABANDONNÉ EN SILENCE sur expiration : `waitForMeilisearch()`
 * retournait normalement quand les 10 s s'écoulaient, et le test enchaînait sur
 * un index à moitié construit. Deux exécutions parallèles de la suite ont
 * produit 10 puis 8 échecs sur des ENSEMBLES DIFFÉRENTS, sans qu'un fichier
 * n'ait changé. Ces tests verrouillent le contrat inverse : sur expiration, on
 * lève, et le message dit de quoi diagnostiquer sans relancer.
 *
 * ⚠ Depuis TCK-334, ils verrouillent une SECONDE propriété, et c'est celle qui
 * a fait rougir 75 tests le 2026-08-20 : la barrière n'abandonne plus parce
 * qu'elle a attendu, elle abandonne parce que le SERVEUR ne fait plus rien.
 * Un serveur lent — deux suites qui se partagent la file, qui est globale à
 * l'instance — doit être attendu, pas dénoncé.
 *
 * L'horloge est INJECTÉE : sans cela, éprouver « elle attend au-delà de
 * l'ancien plafond » coûterait dix secondes de temps mural par test, et
 * personne n'écrirait le test.
 */
class MeilisearchBarrierTest extends TestCase
{
    /**
     * Une horloge virtuelle et son `sleep`, qui l'avance du pas réel de
     * sondage (50 ms). Rend `[now, sleep, &instant]`.
     *
     * @return array{0:\Closure,1:\Closure}
     */
    private function virtualClock(float &$instant, float $step = 0.05): array
    {
        return [
            function () use (&$instant) {
                return $instant;
            },
            function () use (&$instant, $step) {
                $instant += $step;
            },
        ];
    }

    public function test_returns_as_soon_as_the_queue_is_empty(): void
    {
        $calls = 0;

        MeilisearchBarrier::await(
            function () use (&$calls) {
                $calls++;

                return $calls < 3 ? [['indexUid' => 'testing_properties']] : [];
            },
            fetchHeartbeat: fn () => 'batch-1',
            sleep: fn () => null,
        );

        $this->assertSame(3, $calls);
    }

    /**
     * LE test de TCK-334.
     *
     * Le serveur bat sans discontinuer et finit par vider la file au bout de
     * 45 s virtuelles — plus de QUATRE FOIS l'ancien plafond de 10 s. L'ancienne
     * barrière aurait levé à 10 s sur un serveur parfaitement sain ; celle-ci
     * doit rendre la main normalement.
     */
    public function test_it_waits_far_beyond_the_old_wall_clock_cap_while_the_server_beats(): void
    {
        $instant = 0.0;
        [$now, $sleep] = $this->virtualClock($instant);
        $beat = 0;

        MeilisearchBarrier::await(
            fetchPending: fn () => $now() >= 45.0 ? [] : [['indexUid' => 'testing_ab12_properties']],
            fetchHeartbeat: function () use (&$beat) {
                return 'batch-'.++$beat;
            },
            stallTimeout: MeilisearchBarrier::STALL_TIMEOUT_SECONDS,
            absoluteCap: MeilisearchBarrier::ABSOLUTE_CAP_SECONDS,
            sleep: $sleep,
            now: $now,
        );

        $this->assertGreaterThanOrEqual(45.0, $instant);
        $this->assertGreaterThan(
            MeilisearchBarrier::STALL_TIMEOUT_SECONDS,
            $instant,
            'La barrière a rendu la main avant le seuil de stagnation : elle ne peut donc pas '
            .'avoir attendu au-delà, et le test ne prouve rien.',
        );
    }

    public function test_it_throws_when_the_server_stops_beating(): void
    {
        $instant = 0.0;
        [$now, $sleep] = $this->virtualClock($instant);

        try {
            MeilisearchBarrier::await(
                fetchPending: fn () => [['indexUid' => 'testing_ab12_properties']],
                fetchHeartbeat: fn () => 'le-meme-batch-pour-toujours',
                stallTimeout: 10.0,
                absoluteCap: 100.0,
                sleep: $sleep,
                now: $now,
            );
            $this->fail('MeilisearchNotIdleException attendue.');
        } catch (MeilisearchNotIdleException $e) {
            // Elle a levé sur la STAGNATION, donc bien avant le plafond absolu.
            $this->assertLessThan(100.0, $instant);
            // 9,9 et non 10,0 : l'horloge virtuelle avance par pas de 0,05 s et
            // l'accumulation de flottants ne retombe pas exactement sur le seuil.
            $this->assertGreaterThanOrEqual(9.9, $instant);
            $this->assertStringContainsString('AUCUN BATCH', $e->getMessage());
        }
    }

    public function test_it_throws_at_the_absolute_cap_even_while_the_server_beats(): void
    {
        $instant = 0.0;
        [$now, $sleep] = $this->virtualClock($instant);
        $beat = 0;

        try {
            MeilisearchBarrier::await(
                fetchPending: fn () => [['indexUid' => 'testing_ab12_properties']],
                fetchHeartbeat: function () use (&$beat) {
                    return 'batch-'.++$beat;
                },
                stallTimeout: 10.0,
                absoluteCap: 30.0,
                sleep: $sleep,
                now: $now,
            );
            $this->fail('MeilisearchNotIdleException attendue.');
        } catch (MeilisearchNotIdleException $e) {
            $this->assertGreaterThanOrEqual(29.9, $instant);
            $this->assertStringContainsString('PLAFOND ABSOLU', $e->getMessage());
        }
    }

    /**
     * Les deux causes n'appellent pas la même action — l'une dit « le serveur
     * est en panne », l'autre « le serveur est vivant, mais vous êtes deux à
     * l'utiliser ». Un message qui les confond renvoie chercher la lenteur là
     * où il y a une panne, et réciproquement.
     */
    public function test_each_cause_is_named_and_they_are_not_interchangeable(): void
    {
        $instant = 0.0;
        [$now, $sleep] = $this->virtualClock($instant);

        $stalled = $this->messageFrom(
            fetchHeartbeat: fn () => 'fige',
            now: $now,
            sleep: $sleep,
        );

        $instant = 0.0;
        $beat = 0;
        $capped = $this->messageFrom(
            fetchHeartbeat: function () use (&$beat) {
                return 'batch-'.++$beat;
            },
            now: $now,
            sleep: $sleep,
        );

        $this->assertStringContainsString('AUCUN BATCH', $stalled);
        $this->assertStringNotContainsString('PLAFOND ABSOLU', $stalled);

        $this->assertStringContainsString('PLAFOND ABSOLU', $capped);
        $this->assertStringContainsString('battait encore', $capped);
        $this->assertStringNotContainsString('AUCUN BATCH', $capped);
    }

    public function test_the_message_names_the_task_count_the_indexes_and_the_elapsed_time(): void
    {
        $pending = array_merge(
            array_fill(0, 40, ['indexUid' => 'testing_ab12_properties']),
            array_fill(0, 2, ['indexUid' => 'testing_ab12_messages']),
        );

        try {
            MeilisearchBarrier::await(
                fn () => $pending,
                fetchHeartbeat: fn () => 'fige',
                stallTimeout: 0.05,
                sleep: fn () => null,
            );
            $this->fail('MeilisearchNotIdleException attendue.');
        } catch (MeilisearchNotIdleException $e) {
            $message = $e->getMessage();

            // Combien de tâches restaient.
            $this->assertStringContainsString('42', $message);
            // Sur quels index, avec le détail par index.
            $this->assertStringContainsString('testing_ab12_properties: 40', $message);
            $this->assertStringContainsString('testing_ab12_messages: 2', $message);
            // Depuis combien de temps on attendait.
            $this->assertMatchesRegularExpression('/\d+([.,]\d+)?\s*s/', $message);
        }
    }

    public function test_an_unnamed_index_does_not_break_the_diagnostic(): void
    {
        try {
            MeilisearchBarrier::await(
                fn () => [['status' => 'enqueued']],
                fetchHeartbeat: fn () => 'fige',
                stallTimeout: 0.05,
                sleep: fn () => null,
            );
            $this->fail('MeilisearchNotIdleException attendue.');
        } catch (MeilisearchNotIdleException $e) {
            $this->assertStringContainsString('?', $e->getMessage());
        }
    }

    /**
     * Sans battement injecté, la barrière ne peut pas distinguer les deux
     * causes — et elle ne doit surtout PAS attendre indéfiniment pour autant.
     * C'est le rôle du second garde-fou : remplacer un rouge aléatoire par une
     * suspension infinie serait strictement pire, puisqu'une commande
     * suspendue est coupée sans jamais produire de rapport de test.
     */
    public function test_without_a_heartbeat_the_absolute_cap_still_bounds_the_wait(): void
    {
        $instant = 0.0;
        [$now, $sleep] = $this->virtualClock($instant);

        try {
            MeilisearchBarrier::await(
                fetchPending: fn () => [['indexUid' => 'testing_ab12_properties']],
                fetchHeartbeat: null,
                stallTimeout: 10.0,
                absoluteCap: 20.0,
                sleep: $sleep,
                now: $now,
            );
            $this->fail('MeilisearchNotIdleException attendue.');
        } catch (MeilisearchNotIdleException $e) {
            $this->assertGreaterThanOrEqual(19.9, $instant);
            $this->assertStringContainsString('PLAFOND ABSOLU', $e->getMessage());
            $this->assertStringContainsString('pas surveillé', $e->getMessage());
        }
    }

    /**
     * `GET /tasks` PAGINE, et le serveur répond `limit: 20` par défaut (mesuré
     * le 2026-08-22 sur Meilisearch 1.16). Sans `setLimit()`, le
     * `count($pending)` du diagnostic plafonne à 20 : le message SOUS-DÉCLARE
     * l'ampleur du problème au moment précis où on a besoin de la connaître —
     * le backlog mesuré par D-44 valait 3308 tâches.
     *
     * Ce test tombe si la limite disparaît, et il tombe aussi si elle
     * redescend sous le pire backlog mesuré.
     */
    public function test_the_pending_tasks_query_asks_for_a_page_larger_than_the_worst_measured_backlog(): void
    {
        // Classe anonyme : on ne peut pas appeler une méthode statique
        // DIRECTEMENT sur un trait (déprécié depuis PHP 8.1), et le concern n'a
        // pas besoin d'une application Laravel pour construire cette requête.
        $harness = new class
        {
            use InteractsWithMeilisearch;
        };

        $query = $harness::pendingTasksQuery(['testing_ab12_properties'])->toArray();

        $this->assertArrayHasKey(
            'limit',
            $query,
            'Sans `limit`, Meilisearch en rend 20 et le diagnostic de la barrière ment.',
        );
        $this->assertGreaterThanOrEqual(
            3308,
            $query['limit'],
            'La page doit couvrir le pire backlog mesuré (3308 tâches, D-44).',
        );
        // `TasksQuery::toArray()` sérialise les listes en CSV — c'est la forme
        // que le serveur reçoit, donc c'est elle qu'on épingle.
        $this->assertSame('testing_ab12_properties', $query['indexUids'] ?? null);
        $this->assertSame('enqueued,processing', $query['statuses'] ?? null);
    }

    /**
     * @param  \Closure  $fetchHeartbeat
     * @param  \Closure  $now
     * @param  \Closure  $sleep
     */
    private function messageFrom($fetchHeartbeat, $now, $sleep): string
    {
        try {
            MeilisearchBarrier::await(
                fetchPending: fn () => [['indexUid' => 'testing_ab12_properties']],
                fetchHeartbeat: $fetchHeartbeat,
                stallTimeout: 10.0,
                absoluteCap: 30.0,
                sleep: $sleep,
                now: $now,
            );
        } catch (MeilisearchNotIdleException $e) {
            return $e->getMessage();
        }

        $this->fail('MeilisearchNotIdleException attendue.');

        return '';
    }
}

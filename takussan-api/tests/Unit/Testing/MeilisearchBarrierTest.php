<?php

namespace Tests\Unit\Testing;

use PHPUnit\Framework\TestCase;
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
 */
class MeilisearchBarrierTest extends TestCase
{
    public function test_returns_as_soon_as_the_queue_is_empty(): void
    {
        $calls = 0;

        MeilisearchBarrier::await(
            function () use (&$calls) {
                $calls++;

                return $calls < 3 ? [['indexUid' => 'testing_properties']] : [];
            },
            timeout: 5.0,
            sleep: fn () => null,
        );

        $this->assertSame(3, $calls);
    }

    public function test_throws_instead_of_returning_silently_when_the_deadline_expires(): void
    {
        $this->expectException(MeilisearchNotIdleException::class);

        MeilisearchBarrier::await(
            fn () => [['indexUid' => 'testing_properties']],
            timeout: 0.05,
            sleep: fn () => null,
        );
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
                timeout: 0.05,
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
                timeout: 0.05,
                sleep: fn () => null,
            );
            $this->fail('MeilisearchNotIdleException attendue.');
        } catch (MeilisearchNotIdleException $e) {
            $this->assertStringContainsString('?', $e->getMessage());
        }
    }
}

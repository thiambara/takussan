<?php

namespace Tests\Unit\Testing;

use App\Models\Property;
use Laravel\Scout\ModelObserver;
use Tests\Support\SearchableModels;
use Tests\Support\TestProcessToken;
use Tests\TestCase;

/**
 * La CAUSE du débordement : `phpunit.xml` force
 * `SCOUT_DRIVER=meilisearch` + `SCOUT_QUEUE=false`, donc CHAQUE `save()` de la
 * suite ENTIÈRE poussait un document synchrone. Mesure sur une exécution :
 * 3308 tâches, dont 2628 sur `testing_properties`, pour une poignée de tests
 * qui en avaient réellement besoin. La file débordait, la barrière expirait,
 * et des tests qui n'ont rien à voir avec la recherche rougissaient.
 *
 * La synchronisation Scout est désormais coupée par défaut dans la classe de
 * base, et rallumée UNIQUEMENT par le concern (cf.
 * {@see ScoutTestHarnessWithConcernTest}).
 */
class ScoutTestHarnessTest extends TestCase
{
    public function test_scout_syncing_is_off_by_default(): void
    {
        $this->assertNotEmpty(SearchableModels::all());

        foreach (SearchableModels::all() as $model) {
            $this->assertTrue(
                ModelObserver::syncingDisabledFor($model),
                "La synchronisation Scout devrait être coupée pour {$model} dans un test qui ne porte pas InteractsWithMeilisearch.",
            );
        }
    }

    public function test_the_index_prefix_is_unique_per_test_process(): void
    {
        $prefix = config('scout.prefix');

        // Le littéral statique `testing_` laissait deux suites simultanées
        // écrire dans les mêmes index et se détruire mutuellement.
        $this->assertNotSame('testing_', $prefix);

        // ⚠ JETON À DEUX ÉTAGES DEPUIS TCK-321 (phase 2) : `<pid+aléa>` seul hors
        // `--parallel`, `<pid+aléa>_<index worker>` en mode parallèle. Le second
        // étage compose le discriminant PAR EXÉCUTION (`TestProcessToken`, qui isole
        // deux agents lancés en même temps) avec l'index de WORKER que ParaTest pose
        // (qui isole les workers d'UNE MÊME exécution entre eux) — sans lui, deux
        // agents en `--parallel` obtiendraient tous deux `testing_1_`, exactement la
        // panne que D-44 avait soldée. Un ancien motif figé sur un seul bloc
        // alphanumérique (`/^testing_[0-9a-z]+_$/`) rougissait dès qu'un agent
        // lançait la suite en parallèle — invisible en séquentiel, puisque hors
        // `--parallel` le jeton n'a pas de second étage. On affirme donc l'égalité
        // avec le jeton composé lui-même plutôt qu'un motif qu'il faudrait faire
        // évoluer à la main à chaque nouvel étage.
        $this->assertSame('testing_'.TestProcessToken::value().'_', $prefix);

        $this->assertStringStartsWith($prefix, Property::make()->searchableAs());
    }
}

<?php

namespace Tests\Feature\Search;

use App\Http\Controllers\Api\MessagingContactController;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Meilisearch\Client;
use ReflectionClass;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\Support\SearchableModels;
use Tests\TestCase;

/**
 * TCK-709 (P01.06) — le plafond d'identifiants demandé à Meilisearch est réellement servi.
 *
 * `HasQueryBuilder::SEARCH_ID_CAP` demande 5000 identifiants (`take(5000)`), mais Meilisearch
 * n'en rend jamais plus que `pagination.maxTotalHits`, dont le défaut est 1000. Sans réglage
 * déclaré, le plafond réel était donc 1000, en silence : `take()` ne lève pas, il tronque, et
 * la pagination publique s'arrête à la page 25 (à 40 par page).
 *
 * Le test lit le réglage sur les index de CE processus, après `search:sync-index-settings` :
 * c'est l'état que le moteur applique, pas ce que la configuration prétend.
 */
class SearchIdCapIndexSettingsTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    public function test_chaque_index_sert_autant_d_identifiants_que_le_plafond_demande(): void
    {
        $plafond = (new ReflectionClass(Property::class))->getConstant('SEARCH_ID_CAP');
        $this->assertSame(5000, $plafond, 'décision du porteur (P01.06) : maxTotalHits = 5000, aligné sur SEARCH_ID_CAP');

        $client = new Client(config('scout.meilisearch.host'), config('scout.meilisearch.key'));

        foreach (SearchableModels::all() as $model) {
            $index = (new $model)->searchableAs();

            $this->assertSame(
                $plafond,
                $client->index($index)->getPagination()['maxTotalHits'] ?? null,
                "{$model} : l'index {$index} tronque `take({$plafond})` à son maxTotalHits",
            );
        }
    }

    public function test_le_plafond_des_contacts_de_messagerie_reste_celui_de_la_recherche(): void
    {
        $this->assertSame(
            (new ReflectionClass(Property::class))->getConstant('SEARCH_ID_CAP'),
            (new ReflectionClass(MessagingContactController::class))->getConstant('SEARCH_ID_CAP'),
        );
    }
}

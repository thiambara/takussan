<?php

namespace Tests\Feature\Search;

use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\RentPeriod;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\Property;
use App\Services\Admin\PlatformSettingService;
use App\Services\Search\PropertySearchService;
use App\Services\Search\Query\DatabasePlaceLexicon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Meilisearch\Client;
use Tests\Concerns\BuildsSearchSuggestions;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-2457 (AC4, AC5) — l'index des biens garde les biens `is_test` et vendus (`shouldBeSearchable()` ne les écarte
 * pas) : seul `PropertySearchService::publicFilter()` les tient hors des recherches publiques. Contre Meilisearch réel,
 * chaque chemin public vers le moteur est éprouvé.
 *
 * ⚠ Les assertions portent sur ce que le MOTEUR seul décide — totaux, comptes, bornes de prix. Les lignes rendues
 * (`data`, `sponsored`, aperçus, biens d'une alerte) sont rechargées par `Property::public()` en SQL : un bien qui
 * passerait le moteur y disparaîtrait, mais le compte annoncé, lui, le compterait.
 *
 * La carte n'est pas ici : `PublicPropertyController::map()` lit la base par `->public()`, pas le moteur.
 */
class BiensHorsPublicIndexesTest extends TestCase
{
    use BuildsSearchSuggestions;
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private Property $public;

    private Property $test;

    private Property $vendu;

    protected function setUp(): void
    {
        parent::setUp();

        $dakar = GeoCity::factory()->create(['name' => 'Dakar', 'slug' => 'dakar']);
        GeoNeighborhood::factory()->create(['geo_city_id' => $dakar->id, 'name' => 'Almadies', 'slug' => 'almadies']);
        Cache::forget(DatabasePlaceLexicon::CACHE_KEY);

        $commun = [
            'title' => 'Appartement lagune turquoise',
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Monthly,
            'featured' => true,
        ];
        $this->public = $this->publishedIn('Dakar', 'Almadies', [...$commun, 'price' => 200_000]);
        // Publiés et visibles : seul `is_test`, ou le statut `sold`, les sépare du public. Prix extrêmes : ils
        // étireraient la répartition des prix.
        $this->test = $this->publishedIn('Dakar', 'Almadies', [...$commun, 'price' => 9_000_000, 'is_test' => true]);
        $this->vendu = $this->publishedIn('Dakar', 'Almadies', [...$commun, 'price' => 10_000, 'status' => PropertyStatus::Sold]);
        $this->indexProperties();
        $this->buildSuggestions();
    }

    public function test_les_biens_de_test_et_vendus_sont_bien_dans_l_index(): void
    {
        $index = app(Client::class)->index((new Property)->searchableAs());
        foreach ([$this->test, $this->vendu, $this->public] as $bien) {
            $this->assertSame($bien->id, (int) $index->getDocument($bien->id)['id']);
        }
        // Le moteur sans filtre les trouve : le test dit bien quelque chose de `publicFilter()`.
        $this->assertSame(3, $index->search('lagune', ['hitsPerPage' => 0, 'page' => 1])->getTotalHits());
    }

    public function test_la_liste_publique_ne_les_compte_ni_ne_les_rend(): void
    {
        $reponse = $this->getJson('/api/public/properties/search?q=lagune&placements=false&facets=contract_type')->assertOk();

        $this->assertSame(1, $reponse->json('meta.total'));
        $this->assertSame(1, array_sum(array_column($reponse->json('meta.facets.contract_type'), 'count')), 'facettes()');
        $this->assertSame([$this->public->id], array_column($reponse->json('data'), 'id'));
    }

    public function test_les_emplacements_et_places_reservees_ne_les_servent_pas(): void
    {
        app(PlatformSettingService::class)->bulkUpdate([
            // Sans emplacement « Sponsorisé » : avec un seul bien public, la rotation le servirait en emplacement puis
            // l'écarterait de la page (aucun doublon). La place réservée exerce `featuredPool()` puis `organicExcluding()`.
            'boost.sponsored_slots_per_page' => 0,
            'boost.reserved_top_results' => 2,
        ], $this->actingAsRole('super_admin'));

        $reponse = app(PropertySearchService::class)->search(['q' => 'lagune']);

        $servis = [...array_column($reponse['data'], 'id'), ...array_column($reponse['sponsored'], 'id')];
        // Témoin : le vivier des vedettes a bien servi le bien public en place réservée.
        $this->assertSame([[$this->public->id, 'reserved']], array_map(
            fn (array $b) => [$b['id'], $b['placement']], $reponse['data']), 'le vivier des vedettes doit avoir servi');
        $this->assertSame([], array_values(array_intersect($servis, [$this->test->id, $this->vendu->id])));
        $this->assertSame(1, $reponse['meta']['total']);
    }

    public function test_l_elargissement_ne_les_compte_pas(): void
    {
        $reponse = $this->getJson('/api/public/properties/search?q='.rawurlencode('lagune zorglubien'))->assertOk();

        $this->assertSame('widened', $reponse->json('search.strategy'), 'la saisie doit passer par widen()');
        $this->assertSame(1, $reponse->json('search.widened_total'));
        $this->assertSame(1, $reponse->json('meta.total'));
        $this->assertSame([$this->public->id], array_column($reponse->json('data'), 'id'));
    }

    public function test_la_suggestion_ne_les_compte_ni_ne_les_previsualise(): void
    {
        $data = $this->getJson('/api/search/suggest?q='.rawurlencode('appart almadies lagune'))->assertOk()->json('data');

        $this->assertNotNull($data['interpretation'], 'la saisie doit être comprise pour exposer un compte');
        $this->assertSame(1, $data['interpretation']['count']);
        $this->assertSame([$this->public->id], array_column($data['previews'], 'id'));
        $this->assertNotEmpty($data['places'], 'les lieux doivent être rendus, sinon la boucle ne dit rien');
        foreach ($data['places'] as $lieu) {
            $this->assertLessThanOrEqual(1, $lieu['count'], "lieu {$lieu['label']}");
        }
    }

    public function test_l_alerte_de_recherche_ne_les_compte_pas(): void
    {
        $alerte = app(PropertySearchService::class)->alertMatches(['q' => 'lagune'], null, now()->addMinute());

        $this->assertSame(1, $alerte['total']);
        $this->assertSame([$this->public->id], $alerte['properties']->pluck('id')->all());
    }

    public function test_la_repartition_des_prix_ne_les_compte_pas(): void
    {
        $data = $this->getJson('/api/public/properties/price-distribution?contract_type=rent&q=lagune')->assertOk()->json('data');

        $this->assertSame(1, array_sum(array_column($data['buckets'], 'count')));
        $this->assertSame(200000, $data['min']);
        $this->assertSame(200000, $data['max']);
    }
}

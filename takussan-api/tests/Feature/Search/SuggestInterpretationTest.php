<?php

namespace Tests\Feature\Search;

use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Services\Search\Query\DatabasePlaceLexicon;
use App\Services\Search\Suggestions\SuggestionIndex;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Meilisearch\Client;
use Tests\Concerns\BuildsSearchSuggestions;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-2474 (ADR-0088) — la saisie comprise : critères, parts sans libellé, et un compte qui est celui de la liste.
 */
class SuggestInterpretationTest extends TestCase
{
    use BuildsSearchSuggestions;
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private string $url = '/api/search/suggest';

    protected function setUp(): void
    {
        parent::setUp();

        $dakar = GeoCity::factory()->create(['name' => 'Dakar', 'slug' => 'dakar']);
        GeoNeighborhood::factory()->create(['geo_city_id' => $dakar->id, 'name' => 'Almadies', 'slug' => 'almadies']);
        GeoNeighborhood::factory()->create(['geo_city_id' => $dakar->id, 'name' => 'Mermoz', 'slug' => 'mermoz']);
        Cache::forget(DatabasePlaceLexicon::CACHE_KEY);

        // Comptent : appartements d'au moins 3 chambres aux Almadies (chambres = un MINIMUM).
        $this->publishedIn('Dakar', 'Almadies', ['bedrooms' => 3, 'title' => 'Appartement lumineux vue mer']);
        $this->publishedIn('Dakar', 'Almadies', ['bedrooms' => 3, 'title' => 'Appartement calme']);
        $this->publishedIn('Dakar', 'Almadies', ['bedrooms' => 4, 'title' => 'Grand appartement']);
        // Ne comptent pas : 2 chambres, une maison, un autre quartier, un brouillon.
        $this->publishedIn('Dakar', 'Almadies', ['bedrooms' => 2]);
        $this->publishedIn('Dakar', 'Almadies', ['bedrooms' => 3, 'type' => PropertyType::House]);
        $this->publishedIn('Dakar', 'Mermoz', ['bedrooms' => 3]);
        $this->publishedIn('Dakar', 'Almadies', ['bedrooms' => 3, 'status' => PropertyStatus::Draft, 'published_at' => null]);
        $this->indexProperties();
        $this->buildSuggestions();
    }

    /** AC1 — `appart 3ch almadies` : les critères attendus, et le compte que la liste rend sous les mêmes paramètres. */
    public function test_ac1_la_saisie_comprise_et_le_compte_de_la_liste(): void
    {
        $interpretation = $this->getJson($this->url.'?q='.rawurlencode('appart 3ch almadies'))->assertOk()->json('data.interpretation');

        $this->assertEquals(
            ['type' => 'apartment', 'bedrooms' => 3, 'city' => 'Dakar', 'location' => 'Almadies'],
            $interpretation['criteria'],
        );
        $this->assertNull($interpretation['residue']);

        $liste = $this->getJson('/api/public/properties/search?'.http_build_query($interpretation['criteria']))->assertOk();
        $this->assertSame($liste->json('meta.total'), $interpretation['count']);
        $this->assertSame(3, $interpretation['count']);
    }

    public function test_le_residu_est_cherche_en_texte_et_compte_comme_la_liste(): void
    {
        $interpretation = $this->getJson($this->url.'?q='.rawurlencode('appart almadies lumineux'))->json('data.interpretation');

        $this->assertSame('lumineux', $interpretation['residue']);
        $liste = $this->getJson('/api/public/properties/search?'.http_build_query([...$interpretation['criteria'], 'q' => 'lumineux']));
        $this->assertSame($liste->json('meta.total'), $interpretation['count']);
        $this->assertSame(1, $interpretation['count']);
    }

    /**
     * Le compte est celui du régime EXACT (tous les mots du résidu, `matchingStrategy: all`). Sous un résidu de deux
     * mots qu'aucun bien ne porte ensemble, la liste élargit (ADR-0024) et le dit (`search.strategy = widened`) ; la
     * suggestion ne promet pas ces biens-là : elle dit 0.
     */
    public function test_le_compte_ne_promet_que_le_resultat_exact(): void
    {
        $interpretation = $this->getJson($this->url.'?q='.rawurlencode('appart almadies lumineux calme'))->json('data.interpretation');
        $liste = $this->getJson('/api/public/properties/search?'.http_build_query([...$interpretation['criteria'], 'q' => 'lumineux calme']));

        $this->assertSame('lumineux calme', $interpretation['residue']);
        $this->assertSame(0, $interpretation['count']);
        $this->assertSame('widened', $liste->json('search.strategy'));
        $this->assertGreaterThan(0, $liste->json('meta.total'));
    }

    /**
     * TCK-2476 — « je cherche un appartement à almadies » : les mots d'intention ne restent pas au résidu, donc la liste
     * ne les cherche pas et le compte est celui des quatre appartements publiés aux Almadies.
     */
    public function test_les_mots_d_intention_ne_font_pas_tomber_le_compte(): void
    {
        $interpretation = $this->getJson($this->url.'?q='.rawurlencode('je cherche un appartement à almadies'))->assertOk()->json('data.interpretation');

        $this->assertEquals(['type' => 'apartment', 'city' => 'Dakar', 'location' => 'Almadies'], $interpretation['criteria']);
        $this->assertNull($interpretation['residue']);
        $liste = $this->getJson('/api/public/properties/search?'.http_build_query($interpretation['criteria']))->assertOk();
        $this->assertSame($liste->json('meta.total'), $interpretation['count']);
        $this->assertSame(4, $interpretation['count']);
    }

    /** Principe n°5 — des valeurs et des positions, jamais un libellé. */
    public function test_les_parts_ne_portent_aucun_libelle(): void
    {
        $parts = $this->getJson($this->url.'?q='.rawurlencode('appart 3ch almadies'))->json('data.interpretation.parts');

        $this->assertNotEmpty($parts);
        foreach ($parts as $part) {
            $this->assertSame(['key', 'value', 'from', 'to'], array_keys($part));
        }
        $this->assertContains(['key' => 'type', 'value' => 'apartment', 'from' => 0, 'to' => 6], $parts);
    }

    public function test_une_saisie_non_comprise_n_a_pas_d_interpretation(): void
    {
        $this->assertNull($this->getJson($this->url.'?q=lumineux')->assertOk()->json('data.interpretation'));
    }

    public function test_les_previews_sont_ceux_du_compte(): void
    {
        $previews = $this->getJson($this->url.'?q='.rawurlencode('appart 3ch almadies'))->json('data.previews');
        $liste = $this->getJson('/api/public/properties/search?type=apartment&bedrooms=3&city=Dakar&location=Almadies&placements=false');

        $this->assertCount(3, $previews);
        $this->assertEqualsCanonicalizing(array_column($liste->json('data'), 'id'), array_column($previews, 'id'));
    }

    /**
     * Revue adverse n° 5 (2026-11-04) — la barre compte comme la liste qu'elle ouvrira : les filtres que la navigation
     * garde (l'URL courante, « Louer / Acheter ») entrent en BASE ; un critère compris dans la saisie remplace la même
     * clé de la base, les autres clés de la base restent. `criteria` ne dit que ce que la saisie a compris.
     */
    public function test_la_base_de_la_liste_entre_dans_le_compte_et_la_saisie_la_remplace_cle_par_cle(): void
    {
        $this->publishedIn('Dakar', 'Almadies', ['type' => PropertyType::Villa, 'bedrooms' => 4, 'contract_type' => ContractType::Rent]);
        $this->publishedIn('Dakar', 'Mermoz', ['type' => PropertyType::Villa, 'bedrooms' => 5, 'contract_type' => ContractType::Rent]);
        $this->publishedIn('Dakar', 'Almadies', ['type' => PropertyType::Villa, 'bedrooms' => 4, 'contract_type' => ContractType::Sale]);
        $this->publishedIn('Dakar', 'Almadies', ['type' => PropertyType::Villa, 'bedrooms' => 2, 'contract_type' => ContractType::Rent]);
        $this->indexProperties();

        $data = $this->getJson($this->url.'?'.http_build_query(['q' => 'villa 4 chambres', 'contract_type' => 'rent']))->assertOk()->json('data');
        $this->assertEquals(['type' => 'villa', 'bedrooms' => 4], $data['interpretation']['criteria']);
        $liste = $this->getJson('/api/public/properties/search?'.http_build_query(['type' => 'villa', 'bedrooms' => 4, 'contract_type' => 'rent', 'placements' => 'false']))->assertOk();
        $this->assertSame($liste->json('meta.total'), $data['interpretation']['count']);
        $this->assertSame(2, $data['interpretation']['count']);
        $this->assertEqualsCanonicalizing(array_column($liste->json('data'), 'id'), array_column($data['previews'], 'id'), 'les aperçus sont ceux de la fusion');

        // La saisie remplace la même clé de la base (`type=house` → `villa`) ; `location` de la base reste.
        $fusion = $this->getJson($this->url.'?'.http_build_query(['q' => 'villa 4 chambres', 'type' => 'house', 'contract_type' => 'rent', 'location' => 'Mermoz']))
            ->assertOk()->json('data.interpretation');
        $this->assertSame(1, $fusion['count']);

        // Une saisie non comprise : les aperçus portent quand même la base (contrat contraire à celui du bien « lumineux »).
        $lumineux = $this->getJson('/api/public/properties/search?q=lumineux&placements=false')->json('data.0.contract_type');
        $autre = $lumineux === 'rent' ? 'sale' : 'rent';
        $this->assertSame([], $this->getJson($this->url.'?'.http_build_query(['q' => 'lumineux', 'contract_type' => $autre]))->assertOk()->json('data.previews'));
        $this->assertCount(1, $this->getJson($this->url.'?'.http_build_query(['q' => 'lumineux', 'contract_type' => $lumineux]))->json('data.previews'));

        // La base est validée comme la liste.
        $this->getJson($this->url.'?'.http_build_query(['q' => 'villa', 'contract_type' => 'leasing']))->assertStatus(422);
    }

    /**
     * Contrat de la session (TCK-439/635, comme la navigation du front) : une `city` comprise dans la saisie retire aussi
     * `location` et `region` de la base — une ville neuve invalide le quartier et la région d'avant.
     */
    public function test_une_ville_comprise_retire_le_quartier_et_la_region_de_la_base(): void
    {
        $base = ['location' => 'Mermoz', 'region' => 'Thiès'];
        $interpretation = $this->getJson($this->url.'?'.http_build_query(['q' => 'appartement dakar', ...$base]))->assertOk()->json('data.interpretation');

        $this->assertEquals(['type' => 'apartment', 'city' => 'Dakar'], $interpretation['criteria']);
        $liste = $this->getJson('/api/public/properties/search?type=apartment&city=Dakar&placements=false')->assertOk();
        $this->assertSame($liste->json('meta.total'), $interpretation['count']);
        $this->assertSame(5, $interpretation['count']);

        // Sans ville comprise, la base reste entière.
        $sansVille = $this->getJson($this->url.'?'.http_build_query(['q' => 'appartement 3 chambres', 'location' => 'Mermoz']))->json('data.interpretation');
        $this->assertSame(1, $sansVille['count']);
    }

    /**
     * Contrat de la session (n° 9) — `widens` : la liste élargira-t-elle sous ces paramètres (ADR-0024) ? Le même prédicat
     * que `PropertySearchService::search()` : zéro au régime exact ET au moins deux termes utiles au résidu.
     */
    public function test_widens_dit_si_la_liste_elargira(): void
    {
        $deux = $this->getJson($this->url.'?q='.rawurlencode('appart almadies lumineux calme'))->json('data.interpretation');
        $this->assertSame(0, $deux['count']);
        $this->assertTrue($deux['widens']);
        $this->assertSame('widened', $this->getJson('/api/public/properties/search?'.http_build_query([...$deux['criteria'], 'q' => $deux['residue']]))->json('search.strategy'));

        $un = $this->getJson($this->url.'?q='.rawurlencode('appart almadies introuvable'))->json('data.interpretation');
        $this->assertSame(0, $un['count']);
        $this->assertFalse($un['widens'], 'un seul terme utile : la liste n’élargit pas');
        $this->assertSame('all', $this->getJson('/api/public/properties/search?'.http_build_query([...$un['criteria'], 'q' => $un['residue']]))->json('search.strategy'));

        $vide = $this->getJson($this->url.'?q='.rawurlencode('villa piscine'))->json('data.interpretation');
        $this->assertSame(0, $vide['count']);
        $this->assertFalse($vide['widens'], 'aucun résidu');

        $this->assertFalse($this->getJson($this->url.'?q='.rawurlencode('appart almadies lumineux'))->json('data.interpretation.widens'), 'des résultats');
    }

    /** Avant le premier `search:build-suggestions` : la saisie comprise et ses biens, sans lieux ni complétions — pas une 500. */
    public function test_sans_index_des_suggestions_la_saisie_comprise_reste_servie(): void
    {
        $client = app(Client::class);
        $client->waitForTask($client->deleteIndex(SuggestionIndex::uid())['taskUid']);

        $data = $this->getJson($this->url.'?q='.rawurlencode('appart 3ch almadies'))->assertOk()->json('data');
        $this->assertSame(3, $data['interpretation']['count']);
        $this->assertCount(3, $data['previews']);
        $this->assertSame([], $data['places']);
        $this->assertSame([], $data['completions']);
        $this->assertSame([], $this->getJson($this->url.'?q=')->assertOk()->json('data.popular'));
    }

    /**
     * AC4 — les clés que le front lit gardent leur forme. `cities` et `neighborhoods` ont quitté la réponse (décision du
     * porteur du 2026-11-04, 4a) : le front lit `places`. `property_types` reste.
     */
    public function test_ac4_les_cles_du_front_actuel_gardent_leur_forme(): void
    {
        $data = $this->getJson($this->url.'?q=almadies')->assertOk()->json('data');

        foreach (['interpretation', 'completions', 'popular', 'places', 'previews', 'property_types'] as $cle) {
            $this->assertArrayHasKey($cle, $data);
        }
        $this->assertArrayNotHasKey('cities', $data);
        $this->assertArrayNotHasKey('neighborhoods', $data);

        $types = $this->getJson($this->url.'?q=appar')->json('data.property_types');
        $this->assertSame(['label', 'value', 'count'], array_keys($types[0]));
    }
}

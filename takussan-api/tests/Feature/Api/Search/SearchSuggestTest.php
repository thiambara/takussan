<?php

namespace Tests\Feature\Api\Search;

use App\Models\Address;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-335 — ce fichier PORTE `InteractsWithMeilisearch`, et ce n'est pas
 * decoratif : `Tests\TestCase::setUp()` coupe la synchronisation Scout pour
 * toute la suite (cf. D-44). Depuis que `SuggestService` sert `cities` et
 * `neighborhoods` par `POST /indexes/{uid}/facet-search`, un test sans ce
 * concern interroge un index VIDE et rend des groupes vides — ce qui se lit
 * comme un test casse, pas comme une regression.
 *
 * Corollaire : toute fixture doit etre suivie de `indexProperties()`. Les
 * adresses sont creees APRES le bien (relation polymorphe), donc l'evenement
 * de sauvegarde du bien indexerait `city`/`neighborhood` a `null` ;
 * `indexProperties()` reindexe l'ensemble, adresses comprises.
 */
class SearchSuggestTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private string $url = '/api/search/suggest';

    public function test_returns_cities_matching_prefix(): void
    {
        $this->seedPublishedPropertyInCity('Dakar', 3);
        $this->indexProperties();

        $response = $this->getJson($this->url.'?q=da');

        $response->assertOk();
        $cities = $response->json('data.cities');
        $this->assertNotEmpty($cities);
        $found = collect($cities)->firstWhere('label', 'Dakar');
        $this->assertNotNull($found);
        $this->assertEquals(3, $found['count']);
    }

    public function test_case_and_accent_insensitive(): void
    {
        $this->seedPublishedPropertyInCity('Saint-Louis', 2);
        $this->indexProperties();

        foreach (['saint-l', 'SAINT', 'Saint-Louis'] as $query) {
            $response = $this->getJson($this->url.'?q='.urlencode($query));
            $response->assertOk();
            $cities = $response->json('data.cities');
            $found = collect($cities)->firstWhere('label', 'Saint-Louis');
            $this->assertNotNull($found, "Query '{$query}' should match Saint-Louis");
        }
    }

    public function test_excludes_draft_properties(): void
    {
        $published = Property::factory()->published()->create(['type' => PropertyType::Apartment]);
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $published->id,
            'city' => 'Thiès',
            'neighborhood' => null,
        ]);

        $draft = Property::factory()->draft()->create(['type' => PropertyType::Apartment]);
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $draft->id,
            'city' => 'Thiès',
            'neighborhood' => null,
        ]);

        $this->indexProperties();

        $response = $this->getJson($this->url.'?q=Thi');
        $response->assertOk();

        $cities = $response->json('data.cities');
        $found = collect($cities)->firstWhere('label', 'Thiès');
        $this->assertNotNull($found);
        $this->assertEquals(1, $found['count']);
    }

    public function test_neighborhoods_grouped_with_city_context(): void
    {
        $property1 = Property::factory()->published()->create();
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $property1->id,
            'city' => 'Dakar',
            'neighborhood' => 'Almadies',
        ]);

        $property2 = Property::factory()->published()->create();
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $property2->id,
            'city' => 'Dakar',
            'neighborhood' => 'Mermoz',
        ]);

        $this->indexProperties();

        $response = $this->getJson($this->url.'?q=a');
        $response->assertOk();

        $neighborhoods = $response->json('data.neighborhoods');
        $this->assertNotEmpty($neighborhoods);
        $almadies = collect($neighborhoods)->firstWhere('label', 'Almadies');
        $this->assertNotNull($almadies);
        $this->assertArrayHasKey('city', $almadies);
        $this->assertEquals('Dakar', $almadies['city']);
    }

    public function test_property_types_use_translated_labels_per_locale(): void
    {
        $property = Property::factory()->published()->create(['type' => PropertyType::Apartment]);
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $property->id,
            'city' => 'Dakar',
        ]);

        $this->indexProperties();

        Cache::forget('search:suggest:types:fr');
        $responseFr = $this->withHeader('Accept-Language', 'fr')
            ->getJson($this->url.'?q=appar');
        $responseFr->assertOk();
        $typesFr = $responseFr->json('data.property_types');
        $foundFr = collect($typesFr)->firstWhere('value', 'apartment');
        $this->assertNotNull($foundFr, 'FR: apartment type should appear for query "appar"');
        $this->assertEquals('Appartement', $foundFr['label']);

        Cache::forget('search:suggest:types:en');
        $responseEn = $this->withHeader('Accept-Language', 'en')
            ->getJson($this->url.'?q=apart');
        $responseEn->assertOk();
        $typesEn = $responseEn->json('data.property_types');
        $foundEn = collect($typesEn)->firstWhere('value', 'apartment');
        $this->assertNotNull($foundEn, 'EN: apartment type should appear for query "apart"');
        $this->assertEquals('Apartment', $foundEn['label']);
    }

    /** TCK-507 (AC1, AC2) — une faute sur un type rend le libellé de la locale ; sous 5 caractères, rien. */
    public function test_a_typo_on_a_property_type_yields_the_localised_label(): void
    {
        $property = Property::factory()->published()->create(['type' => PropertyType::Apartment]);
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $property->id,
            'city' => 'Dakar',
        ]);

        $this->indexProperties();

        Cache::forget('search:suggest:types:fr');
        $types = $this->withHeader('Accept-Language', 'fr')
            ->getJson($this->url.'?q=apprtement')
            ->assertOk()
            ->json('data.property_types');
        $found = collect($types)->firstWhere('value', 'apartment');
        $this->assertNotNull($found, 'FR : « apprtement » doit atteindre le type appartement malgré la faute');
        $this->assertSame('Appartement', $found['label']);
        $this->assertSame(1, $found['count']);

        $this->assertSame(
            [],
            $this->withHeader('Accept-Language', 'fr')->getJson($this->url.'?q=aprt')->assertOk()->json('data.property_types'),
            'Sous 5 caractères, aucune tolérance',
        );
    }

    public function test_empty_query_returns_empty_groups(): void
    {
        $response = $this->getJson($this->url.'?q=');
        $response->assertOk();
        $response->assertJson([
            'data' => [
                'cities' => [],
                'neighborhoods' => [],
                'property_types' => [],
            ],
        ]);
    }

    public function test_rate_limit_returns_429_after_60_requests(): void
    {
        RateLimiter::clear('search-suggest|'.request()->ip());

        for ($i = 0; $i < 60; $i++) {
            $this->getJson($this->url.'?q=da');
        }

        $response = $this->getJson($this->url.'?q=da');
        $response->assertStatus(429);
    }

    public function test_cache_control_header_set_to_60_seconds(): void
    {
        $response = $this->getJson($this->url.'?q=da');
        $response->assertOk();
        $cacheControl = $response->headers->get('Cache-Control', '');
        $this->assertStringContainsString('public', $cacheControl);
        $this->assertStringContainsString('max-age=60', $cacheControl);
    }

    /**
     * TCK-335 — LE defaut du ticket : `SuggestService` filtrait par
     * `str_starts_with` sur une liste tiree de la base, donc une seule faute de frappe
     * rendait ZERO suggestion, alors que Meilisearch tourne a cote.
     *
     * ⚠ Ce que ce test ne promet PAS, et c'est mesure : `facet-search` fait du
     * PREFIXE tolerant, pas de la sous-chaine. `akar` ne rend pas `Dakar`,
     * `gorgui` ne rend pas `Cite Keur Gorgui`, et `dakr` ne rend rien du tout
     * (4 caracteres < `minWordSizeForTypos.oneTypo` = 5). « mrmoz » passe DE
     * JUSTESSE, parce qu'il fait exactement 5 caracteres.
     */
    public function test_neighborhood_suggestion_tolerates_a_typo(): void
    {
        $this->seedPublishedPropertyInNeighborhood('Dakar', 'Mermoz', 4);
        $this->indexProperties();

        $response = $this->getJson($this->url.'?q=mrmoz');

        $response->assertOk();
        $neighborhoods = $response->json('data.neighborhoods');
        $found = collect($neighborhoods)->firstWhere('label', 'Mermoz');

        $this->assertNotNull(
            $found,
            'Une faute de frappe sur 5 caracteres doit encore rendre Mermoz : c\'est tout l\'objet de la bascule sur le moteur.',
        );
        $this->assertSame('Dakar', $found['city']);
        $this->assertSame(4, $found['count']);
    }

    /**
     * TCK-335 — LA propriete non negociable : une suggestion « Mermoz (20) »
     * doit mener a 20 resultats. Le compte de la facette et le `meta.total` de
     * `/search` sont ici mesures sur le MEME filtre public, et compares.
     *
     * La fixture contient exprès un bien VENDU dans le meme quartier. Il est
     * `visibility = public`, `is_test = false`, `published_at` non nul et
     * `shouldBeSearchable()` le laisse passer : il n'est ecarte que par la
     * QUATRIEME clause de {@see PropertySearchService::publicFilter()},
     * `NOT status IN [...]`. Un filtre a trois clauses ferait donc rendre 4 a la
     * suggestion et 3 a la recherche — exactement l'ecart mesure en grand sur la
     * base locale (« Mermoz 29 » au lieu de 20, « Dakar 462 » au lieu de 210).
     */
    public function test_suggested_count_equals_search_total_on_the_same_filter(): void
    {
        $this->seedPublishedPropertyInNeighborhood('Dakar', 'Mermoz', 3);
        $this->seedPublishedPropertyInNeighborhood('Dakar', 'Mermoz', 1, PropertyStatus::Sold);
        $this->indexProperties();

        $suggestion = $this->getJson($this->url.'?q=mermoz');
        $suggestion->assertOk();
        $found = collect($suggestion->json('data.neighborhoods'))->firstWhere('label', 'Mermoz');
        $this->assertNotNull($found);

        $recherche = $this->getJson('/api/public/properties/search?city=Dakar&location=Mermoz');
        $recherche->assertOk();

        $this->assertSame(
            $recherche->json('meta.total'),
            $found['count'],
            'Le compte annonce par la suggestion doit etre EXACTEMENT le total rendu par /search sur le meme filtre.',
        );
        $this->assertSame(3, $found['count']);
    }

    private function seedPublishedPropertyInNeighborhood(
        string $city,
        string $neighborhood,
        int $count,
        ?PropertyStatus $status = null,
    ): void {
        for ($i = 0; $i < $count; $i++) {
            $property = Property::factory()->published()->create(['type' => PropertyType::Apartment]);
            if ($status !== null) {
                $property->forceFill(['status' => $status])->save();
            }
            Address::factory()->create([
                'addressable_type' => Property::class,
                'addressable_id' => $property->id,
                'city' => $city,
                'neighborhood' => $neighborhood,
            ]);
        }
    }

    private function seedPublishedPropertyInCity(string $city, int $count): void
    {
        for ($i = 0; $i < $count; $i++) {
            $property = Property::factory()->published()->create(['type' => PropertyType::Apartment]);
            Address::factory()->create([
                'addressable_type' => Property::class,
                'addressable_id' => $property->id,
                'city' => $city,
                'neighborhood' => null,
            ]);
        }
    }
}

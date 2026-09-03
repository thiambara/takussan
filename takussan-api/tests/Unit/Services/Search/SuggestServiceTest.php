<?php

namespace Tests\Unit\Services\Search;

use App\Models\Address;
use App\Models\Enums\PropertyType;
use App\Models\Property;
use App\Services\Search\PropertySearchService;
use App\Services\Search\SuggestService;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Scout\EngineManager;
use Meilisearch\Contracts\FacetSearchQuery;
use Mockery;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-335 — ce fichier a CHANGÉ DE NATURE, et il faut le dire.
 *
 * Il montait un `CacheRepository` en mock, lui faisait rendre une « base »
 * de villes, de quartiers et de types, puis vérifiait le filtrage par préfixe
 * sur les trois groupes. Deux de ces trois groupes ne passent plus par le
 * cache ni par la base : `cities` et `neighborhoods` sont servis par
 * `POST /indexes/{uid}/facet-search`, pour la tolérance à la faute. Un mock de
 * cache ne peut plus rien prouver à leur sujet — il rendrait une base que le
 * service ne lit plus, et le test serait vert quoi qu'il arrive.
 *
 * Ce qui SUBSISTE d'unitaire est donc réduit, et ciblé sur ce qui reste sur le
 * chemin par la base : le court-circuit de la requête vide, et le filtrage par
 * préfixe de `property_types`. S'y ajoute une épreuve qui n'est pas unitaire
 * mais qui est la plus utile du fichier : celle qui MESURE pourquoi
 * `property_types` n'a pas basculé.
 */
class SuggestServiceTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    /** Base de types injectée par le mock de cache — jamais lue depuis la base ici. */
    private const TYPES = [
        ['label' => 'Appartement', 'value' => 'apartment', 'count' => 8, 'normalized_label' => 'appartement'],
        ['label' => 'Autre', 'value' => 'other', 'count' => 5, 'normalized_label' => 'autre'],
        ['label' => 'Hôtel', 'value' => 'hotel', 'count' => 3, 'normalized_label' => 'hotel'],
    ];

    private SuggestService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $cache = Mockery::mock(CacheRepository::class);
        $cache->shouldReceive('remember')->andReturn(self::TYPES);
        $this->service = new SuggestService($cache);
    }

    public function test_empty_query_short_circuits_before_any_lookup(): void
    {
        // `shouldNotReceive` : la requête vide ne doit toucher NI le cache, NI
        // — par voie de conséquence — la base ou le moteur.
        $cache = Mockery::mock(CacheRepository::class);
        $cache->shouldNotReceive('remember');

        $result = (new SuggestService($cache))->resolve('   ', 10, 'fr');

        $this->assertSame(
            ['cities' => [], 'neighborhoods' => [], 'property_types' => []],
            $result,
        );
    }

    public function test_normalize_strips_accents_and_lowercases(): void
    {
        // 'HOT' (majuscules, sans accent) doit atteindre 'Hôtel' via normalize()
        // → str_starts_with('hotel', 'hot').
        $result = $this->service->resolve('HOT', 10, 'fr');

        $this->assertCount(1, $result['property_types']);
        $this->assertSame('Hôtel', $result['property_types'][0]['label']);
    }

    public function test_filter_prefix_preserves_the_count_ordering_of_the_base(): void
    {
        $result = $this->service->resolve('a', 10, 'fr');

        $this->assertCount(2, $result['property_types']); // Appartement + Autre
        $this->assertGreaterThan(
            $result['property_types'][1]['count'],
            $result['property_types'][0]['count'],
        );
    }

    public function test_filter_prefix_respects_limit_per_group(): void
    {
        $result = $this->service->resolve('a', 1, 'fr');

        $this->assertCount(1, $result['property_types']);
    }

    /**
     * TCK-507 — la faute de frappe, jugée comme `/search` la juge.
     *
     * « apprtement » (10 caractères, budget 2) est à UNE faute de « appartement » :
     * la recherche plein-texte le tolère, la suggestion doit le tolérer aussi.
     */
    public function test_a_typo_on_a_long_word_still_reaches_the_type(): void
    {
        $result = $this->service->resolve('apprtement', 10, 'fr');

        $this->assertCount(1, $result['property_types']);
        $this->assertSame('apartment', $result['property_types'][0]['value']);
        $this->assertArrayNotHasKey('normalized_label', $result['property_types'][0]);
    }

    /** Sous 5 caractères, aucune tolérance — exactement le seuil du moteur (`oneTypo = 5`). */
    public function test_no_typo_tolerance_under_five_characters(): void
    {
        $this->assertSame([], $this->service->resolve('aprt', 10, 'fr')['property_types']);
        $this->assertSame([], $this->service->resolve('htel', 10, 'fr')['property_types']);
    }

    /** À 5 caractères, une faute passe ; deux ne passent pas avant 9. */
    public function test_one_typo_from_five_characters_two_from_nine(): void
    {
        // « hatol » : deux substitutions → refusé à 5 caractères. (⚠ pas une transposition
        // comme « hotle » : elle est à UNE édition du préfixe « hote », et passe — comme chez
        // Meilisearch, qui la compte pour une faute.)
        $this->assertSame([], $this->service->resolve('hatol', 10, 'fr')['property_types']);
        // « hotal » : une substitution → accepté.
        $this->assertSame('hotel', $this->service->resolve('hotal', 10, 'fr')['property_types'][0]['value']);
        // « apparteemnt » (11) : deux éditions → accepté.
        $this->assertSame('apartment', $this->service->resolve('apparteemnt', 10, 'fr')['property_types'][0]['value']);
    }

    /** La faute est jugée en PRÉFIXE, comme le moteur : « apprt » est à une faute de « appar ». */
    public function test_typo_is_judged_as_a_prefix(): void
    {
        $this->assertSame('apartment', $this->service->resolve('apprt', 10, 'fr')['property_types'][0]['value']);
    }

    /**
     * Le préfixe strict passe AVANT la faute, quel que soit le compte : « autre » est un préfixe
     * exact d'« Autre » (5) et à une faute d'aucun autre libellé ; « aptre » n'est un préfixe de
     * rien, mais à une faute d'« autre ». Le test qui compte : un préfixe exact d'un type à petit
     * compte devance un candidat à distance d'un type à grand compte.
     */
    public function test_exact_prefix_ranks_before_typo_candidates(): void
    {
        $cache = Mockery::mock(CacheRepository::class);
        $cache->shouldReceive('remember')->andReturn([
            ['label' => 'Villa', 'value' => 'villa', 'count' => 50, 'normalized_label' => 'villa'],
            ['label' => 'Ville', 'value' => 'ville', 'count' => 1, 'normalized_label' => 'ville'],
        ]);
        $service = new SuggestService($cache);

        $values = array_column($service->resolve('ville', 10, 'fr')['property_types'], 'value');

        $this->assertSame(['ville', 'villa'], $values);
    }

    public function test_types_base_is_cached_per_locale(): void
    {
        $cache = Mockery::mock(CacheRepository::class);

        $cache->shouldReceive('remember')
            ->with('search:suggest:types:fr', 300, Mockery::any())
            ->once()
            ->andReturn([]);

        $cache->shouldReceive('remember')
            ->with('search:suggest:types:en', 300, Mockery::any())
            ->once()
            ->andReturn([]);

        $service = new SuggestService($cache);

        $service->resolve('appart', 10, 'fr');
        $service->resolve('apart', 10, 'en');
    }

    /**
     * L'épreuve qui JUSTIFIE le partage — et la seule qui ne serait pas
     * remplaçable par une relecture du code.
     *
     * `type` est indexé par la valeur d'enum ANGLAISE ; `type_label` est
     * searchable mais pas filterable, donc pas facetable. Une facette sur
     * `type` ne répond donc pas à « maison », et si elle répond, elle répond
     * « apartment » — un libellé anglais servi à un francophone, dans le lot
     * dont l'autre moitié répare justement la localisation.
     *
     * Le jour où quelqu'un rendra `type_label` filterable et voudra basculer
     * ce groupe, c'est ce test qui rougira, et son message dira pourquoi.
     */
    public function test_type_facet_cannot_serve_a_localised_label(): void
    {
        $property = Property::factory()->published()->create(['type' => PropertyType::House]);
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $property->id,
            'city' => 'Dakar',
            'neighborhood' => 'Mermoz',
        ]);
        $this->indexProperties();

        $facette = fn (string $terme): array => app(EngineManager::class)->engine()
            ->index((new Property)->searchableAs())
            ->facetSearch(
                (new FacetSearchQuery)
                    ->setFacetName('type')
                    ->setFacetQuery($terme)
                    ->setFilter(PropertySearchService::publicFilter())
            )
            ->getFacetHits();

        $this->assertSame(
            [],
            $facette('maison'),
            'Si cette assertion rougit, la facette `type` répond désormais au français : le partage base/moteur peut être rediscuté.',
        );
        // La MEME facette repond bien a la valeur d'enum anglaise : ce n'est pas
        // la facette qui est cassee, c'est la langue qu'elle porte.
        $this->assertSame('house', $facette('hou')[0]['value'] ?? null);

        // Le chemin par la base, lui, répond — et dans la locale demandée.
        $types = app(SuggestService::class)->resolve('maison', 10, 'fr')['property_types'];
        $this->assertSame('Maison', collect($types)->firstWhere('value', 'house')['label'] ?? null);
    }
}

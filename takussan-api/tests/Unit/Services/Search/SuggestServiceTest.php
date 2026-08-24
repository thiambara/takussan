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

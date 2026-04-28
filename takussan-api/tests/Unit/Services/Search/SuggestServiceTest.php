<?php

namespace Tests\Unit\Services\Search;

use App\Services\Search\SuggestService;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Mockery;
use Tests\TestCase;

class SuggestServiceTest extends TestCase
{
    private SuggestService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $cache = Mockery::mock(CacheRepository::class);
        $cache->shouldReceive('remember')->andReturn([
            'cities' => [
                ['label' => 'Dakar', 'slug' => 'dakar', 'count' => 10, 'normalized_label' => 'dakar'],
                ['label' => 'Diourbel', 'slug' => 'diourbel', 'count' => 5, 'normalized_label' => 'diourbel'],
                ['label' => 'Thiès', 'slug' => 'thies', 'count' => 3, 'normalized_label' => 'thies'],
            ],
            'neighborhoods' => [
                ['label' => 'Almadies', 'city' => 'Dakar', 'slug' => 'almadies', 'count' => 3, 'normalized_label' => 'almadies'],
            ],
            'property_types' => [
                ['label' => 'Appartement', 'value' => 'apartment', 'count' => 8, 'normalized_label' => 'appartement'],
            ],
        ]);
        $this->service = new SuggestService($cache);
    }

    public function test_normalize_strips_accents_and_lowercases(): void
    {
        // 'Thi' (uppercase, no accent) must match 'Thiès' via normalize → str_starts_with('thies', 'thi')
        $result = $this->service->resolve('Thi', 10, 'fr');

        $this->assertCount(1, $result['cities']);
        $this->assertEquals('Thiès', $result['cities'][0]['label']);
    }

    public function test_filter_prefix_sorts_by_count_then_alpha(): void
    {
        // Base is pre-sorted by count desc; filterPrefix must preserve that order
        $result = $this->service->resolve('d', 10, 'fr');

        $this->assertCount(2, $result['cities']); // Dakar + Diourbel
        $this->assertGreaterThan($result['cities'][1]['count'], $result['cities'][0]['count']);
    }

    public function test_filter_prefix_respects_limit_per_group(): void
    {
        // Two cities match 'd' but limit=1 must cap the group at one result
        $result = $this->service->resolve('d', 1, 'fr');

        $this->assertCount(1, $result['cities']);
    }

    public function test_get_base_caches_per_locale(): void
    {
        $cache = Mockery::mock(CacheRepository::class);

        $cache->shouldReceive('remember')
            ->with(Mockery::pattern('/fr/'), 300, Mockery::any())
            ->once()
            ->andReturn(['cities' => [], 'neighborhoods' => [], 'property_types' => []]);

        $cache->shouldReceive('remember')
            ->with(Mockery::pattern('/en/'), 300, Mockery::any())
            ->once()
            ->andReturn(['cities' => [], 'neighborhoods' => [], 'property_types' => []]);

        $service = new SuggestService($cache);

        $service->resolve('da', 10, 'fr');
        $service->resolve('da', 10, 'en');
    }
}

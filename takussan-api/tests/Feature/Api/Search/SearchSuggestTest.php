<?php

namespace Tests\Feature\Api\Search;

use App\Models\Address;
use App\Models\Enums\PropertyType;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

class SearchSuggestTest extends TestCase
{
    use RefreshDatabase;

    private string $url = '/api/search/suggest';

    public function test_returns_cities_matching_prefix(): void
    {
        $this->seedPublishedPropertyInCity('Dakar', 3);

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

        Cache::forget('search:suggest:base:fr');
        $responseFr = $this->withHeader('Accept-Language', 'fr')
            ->getJson($this->url.'?q=appar');
        $responseFr->assertOk();
        $typesFr = $responseFr->json('data.property_types');
        $foundFr = collect($typesFr)->firstWhere('value', 'apartment');
        $this->assertNotNull($foundFr, 'FR: apartment type should appear for query "appar"');
        $this->assertEquals('Appartement', $foundFr['label']);

        Cache::forget('search:suggest:base:en');
        $responseEn = $this->withHeader('Accept-Language', 'en')
            ->getJson($this->url.'?q=apart');
        $responseEn->assertOk();
        $typesEn = $responseEn->json('data.property_types');
        $foundEn = collect($typesEn)->firstWhere('value', 'apartment');
        $this->assertNotNull($foundEn, 'EN: apartment type should appear for query "apart"');
        $this->assertEquals('Apartment', $foundEn['label']);
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

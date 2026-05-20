<?php

namespace Tests\Feature\Search;

use App\Models\Address;
use App\Models\Enums\PropertyType;
use App\Models\Property;
use App\Services\Search\PropertySearchService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

class PropertySearchServiceTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private function service(): PropertySearchService
    {
        return app(PropertySearchService::class);
    }

    private function publish(array $attrs = [], ?string $neighborhood = null, ?array $geo = null): Property
    {
        $property = Property::factory()->published()->create($attrs);

        if ($neighborhood !== null || $geo !== null) {
            Address::create([
                'addressable_type' => Property::class,
                'addressable_id' => $property->id,
                'city' => 'Dakar',
                'neighborhood' => $neighborhood,
                'latitude' => $geo['lat'] ?? null,
                'longitude' => $geo['lng'] ?? null,
            ]);
        }

        return $property;
    }

    public function test_text_search_is_typo_tolerant(): void
    {
        $this->publish(['title' => 'Bel appartement neuf', 'type' => PropertyType::Apartment]);
        $this->publish(['title' => 'Villa avec piscine', 'type' => PropertyType::Villa]);
        $this->indexProperties();

        $result = $this->service()->search(['q' => 'appartemnt']);

        $this->assertSame(1, $result['meta']['total']);
        $this->assertStringContainsString('appartement', $result['data'][0]['title']);
    }

    public function test_price_range_filter_reports_exact_total(): void
    {
        $this->publish(['price' => 100000]);
        $this->publish(['price' => 100000]);
        $this->publish(['price' => 100000]);
        $this->publish(['price' => 900000]);
        $this->publish(['price' => 900000]);
        $this->indexProperties();

        $result = $this->service()->search(['price_max' => 500000, 'per_page' => 2]);

        $this->assertSame(3, $result['meta']['total']);
        $this->assertSame(2, $result['meta']['last_page']);
        $this->assertSame(1, $result['meta']['current_page']);
        $this->assertCount(2, $result['data']);
    }

    public function test_returns_facets_for_locations_bedrooms_and_types(): void
    {
        $this->publish(['bedrooms' => 2, 'type' => PropertyType::Apartment], 'Almadies');
        $this->publish(['bedrooms' => 3, 'type' => PropertyType::Apartment], 'Almadies');
        $this->publish(['bedrooms' => 2, 'type' => PropertyType::Villa], 'Plateau');
        $this->indexProperties();

        $result = $this->service()->search([]);

        $this->assertArrayHasKey('locations', $result['facets']);
        $this->assertArrayHasKey('bedrooms', $result['facets']);
        $this->assertArrayHasKey('types', $result['facets']);
        $this->assertSame(2, $result['facets']['locations']['Almadies']);
        $this->assertSame(1, $result['facets']['locations']['Plateau']);
    }

    public function test_sort_price_asc_orders_results_ascending(): void
    {
        $this->publish(['price' => 500000]);
        $this->publish(['price' => 100000]);
        $this->publish(['price' => 300000]);
        $this->indexProperties();

        $result = $this->service()->search(['sort' => 'price_asc']);

        $prices = array_column($result['data'], 'price');
        $this->assertSame([100000.0, 300000.0, 500000.0], array_map('floatval', $prices));
    }

    public function test_geo_bounding_box_excludes_properties_outside(): void
    {
        $dakar = $this->publish(['title' => 'Inside Dakar'], 'Almadies', ['lat' => 14.74, 'lng' => -17.50]);
        $this->publish(['title' => 'Far in Paris'], 'Paris', ['lat' => 48.85, 'lng' => 2.35]);
        $this->indexProperties();

        $result = $this->service()->search([
            'lat_min' => 14.6, 'lat_max' => 14.8,
            'lng_min' => -17.6, 'lng_max' => -17.4,
        ]);

        $this->assertSame(1, $result['meta']['total']);
        $this->assertSame($dakar->id, $result['data'][0]['id']);
    }

    public function test_draft_property_is_never_returned(): void
    {
        $this->publish(['title' => 'Public listing']);
        Property::factory()->draft()->create(['title' => 'Secret draft']);
        $this->indexProperties();

        $result = $this->service()->search([]);

        $this->assertSame(1, $result['meta']['total']);
        $this->assertSame('Public listing', $result['data'][0]['title']);
    }
}

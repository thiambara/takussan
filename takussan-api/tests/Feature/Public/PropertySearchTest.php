<?php

namespace Tests\Feature\Public;

use App\Models\Address;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PropertySearchTest extends TestCase
{
    use RefreshDatabase;

    private function published(array $attrs = [], ?string $neighborhood = null): Property
    {
        $property = Property::factory()->published()->create($attrs);
        if ($neighborhood) {
            Address::create([
                'addressable_type' => Property::class,
                'addressable_id' => $property->id,
                'neighborhood' => $neighborhood,
                'city' => 'Dakar',
            ]);
        }

        return $property;
    }

    public function test_returns_all_published_without_filters(): void
    {
        $this->published();
        $this->published();
        Property::factory()->draft()->create();

        $response = $this->getJson('/api/public/properties/search');

        $response->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_filter_by_location(): void
    {
        $this->published([], 'Almadies');
        $this->published([], 'Plateau');

        $response = $this->getJson('/api/public/properties/search?location=Almadies');

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertEquals('Almadies', $response->json('data.0.location.quarter'));
    }

    public function test_filter_by_price_range(): void
    {
        $this->published(['price' => 100_000]);
        $this->published(['price' => 300_000]);
        $this->published(['price' => 800_000]);

        $response = $this->getJson('/api/public/properties/search?price_min=200000&price_max=500000');

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertEquals(300_000, $response->json('data.0.price'));
    }

    public function test_filter_by_bedrooms(): void
    {
        $this->published(['bedrooms' => 1]);
        $this->published(['bedrooms' => 3]);

        $response = $this->getJson('/api/public/properties/search?bedrooms=3');

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertEquals(3, $response->json('data.0.bedrooms'));
    }

    public function test_returns_facets(): void
    {
        $this->published(['bedrooms' => 2], 'Almadies');
        $this->published(['bedrooms' => 3], 'Almadies');
        $this->published(['bedrooms' => 2], 'Plateau');

        $response = $this->getJson('/api/public/properties/search');

        $response->assertOk()
            ->assertJsonStructure(['data', 'facets' => ['locations', 'bedrooms', 'types'], 'meta']);
        $this->assertEquals(2, $response->json('facets.locations.Almadies'));
    }

    public function test_sort_by_price_ascending(): void
    {
        $this->published(['price' => 500_000]);
        $this->published(['price' => 100_000]);
        $this->published(['price' => 300_000]);

        $response = $this->getJson('/api/public/properties/search?sort=price_asc');

        $response->assertOk();
        $prices = collect($response->json('data'))->pluck('price')->toArray();
        $this->assertEquals([100_000, 300_000, 500_000], $prices);
    }

    public function test_sort_by_price_descending(): void
    {
        $this->published(['price' => 500_000]);
        $this->published(['price' => 100_000]);
        $this->published(['price' => 300_000]);

        $response = $this->getJson('/api/public/properties/search?sort=price_desc');

        $response->assertOk();
        $prices = collect($response->json('data'))->pluck('price')->toArray();
        $this->assertEquals([500_000, 300_000, 100_000], $prices);
    }
}

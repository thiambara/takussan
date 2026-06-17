<?php

namespace Tests\Feature\Public;

use App\Models\Address;
use App\Models\Enums\PropertyType;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

class PropertySearchTest extends TestCase
{
    use InteractsWithMeilisearch;
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
        $this->indexProperties();

        $response = $this->getJson('/api/public/properties/search');

        $response->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_filter_by_location(): void
    {
        $this->published([], 'Almadies');
        $this->published([], 'Plateau');
        $this->indexProperties();

        $response = $this->getJson('/api/public/properties/search?location=Almadies');

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertEquals('Almadies', $response->json('data.0.location.quarter'));
    }

    public function test_filter_by_price_range(): void
    {
        $this->published(['price' => 100_000]);
        $this->published(['price' => 300_000]);
        $this->published(['price' => 800_000]);
        $this->indexProperties();

        $response = $this->getJson('/api/public/properties/search?price_min=200000&price_max=500000');

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertEquals(300_000, $response->json('data.0.price'));
    }

    public function test_filter_by_bedrooms(): void
    {
        $this->published(['bedrooms' => 1]);
        $this->published(['bedrooms' => 3]);
        $this->indexProperties();

        $response = $this->getJson('/api/public/properties/search?bedrooms=3');

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertEquals(3, $response->json('data.0.bedrooms'));
    }

    public function test_filter_by_rent_period(): void
    {
        $this->published(['contract_type' => 'rent', 'rent_period' => 'monthly']);
        $this->published(['contract_type' => 'rent', 'rent_period' => 'daily']);
        $this->indexProperties();

        $response = $this->getJson('/api/public/properties/search?rent_period=monthly');

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertEquals('monthly', $response->json('data.0.rent_period'));
    }

    public function test_returns_facets(): void
    {
        $this->published(['bedrooms' => 2], 'Almadies');
        $this->published(['bedrooms' => 3], 'Almadies');
        $this->published(['bedrooms' => 2], 'Plateau');
        $this->indexProperties();

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
        $this->indexProperties();

        $response = $this->getJson('/api/public/properties/search?sort=price_asc');

        $response->assertOk();
        $prices = collect($response->json('data'))->pluck('price')->map(fn ($p) => (float) $p)->toArray();
        $this->assertEquals([100_000.0, 300_000.0, 500_000.0], $prices);
    }

    public function test_sort_by_price_descending(): void
    {
        $this->published(['price' => 500_000]);
        $this->published(['price' => 100_000]);
        $this->published(['price' => 300_000]);
        $this->indexProperties();

        $response = $this->getJson('/api/public/properties/search?sort=price_desc');

        $response->assertOk();
        $prices = collect($response->json('data'))->pluck('price')->map(fn ($p) => (float) $p)->toArray();
        $this->assertEquals([500_000.0, 300_000.0, 100_000.0], $prices);
    }

    public function test_search_matches_property_type_via_french_alias(): void
    {
        // Title carries no "appart*" token — the match comes purely from the
        // indexed `type_label` French alias of the Apartment type.
        $apartment = $this->published([
            'title' => 'Loft lumineux et calme',
            'description' => 'Vue mer, grande terrasse.',
            'type' => PropertyType::Apartment,
        ]);
        $this->published([
            'title' => 'Villa familiale',
            'description' => 'Grand jardin arboré.',
            'type' => PropertyType::Villa,
        ]);
        $this->indexProperties();

        $response = $this->getJson('/api/public/properties/search?search=appartement');

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame($apartment->id, $response->json('data.0.id'));
    }

    public function test_search_is_typo_tolerant(): void
    {
        $this->published(['title' => 'Bel appartement neuf', 'type' => PropertyType::Apartment]);
        $this->published(['title' => 'Villa avec piscine', 'type' => PropertyType::Villa]);
        $this->indexProperties();

        $response = $this->getJson('/api/public/properties/search?q=appartemnt');

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertStringContainsString('appartement', $response->json('data.0.title'));
    }
}

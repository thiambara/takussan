<?php

namespace Tests\Feature\Search;

use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Scout\EngineManager;
use Laravel\Scout\Engines\CollectionEngine;
use Tests\TestCase;

class ScoutSearchTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Ensure the in-memory Scout driver is active regardless of ambient env.
        config(['scout.driver' => 'collection']);
    }

    public function test_uses_collection_driver_in_tests(): void
    {
        $engine = app(EngineManager::class)->engine();

        $this->assertInstanceOf(CollectionEngine::class, $engine);
    }

    public function test_full_text_search_returns_matching_properties(): void
    {
        $match = Property::factory()->published()->create([
            'type' => PropertyType::House,
            'title' => 'Luxury seaside quarantazor home',
            'description' => 'Panoramic ocean view with private pool.',
        ]);

        Property::factory()->published()->create([
            'type' => PropertyType::Studio,
            'title' => 'Modern downtown flat',
            'description' => 'Compact place near metro station.',
        ]);

        $results = Property::search('quarantazor')->get();

        $this->assertCount(1, $results);
        $this->assertTrue($results->first()->is($match));
    }

    public function test_search_results_are_paginable(): void
    {
        Property::factory()->count(6)->published()->create([
            'type' => PropertyType::Apartment,
            'title' => 'Zorgonium rental option',
        ]);

        $page = Property::search('zorgonium')->paginate(2);

        $this->assertSame(2, $page->perPage());
        $this->assertSame(6, $page->total());
        $this->assertCount(2, $page->items());
    }

    public function test_searchable_array_exposes_filterable_and_searchable_fields(): void
    {
        $property = Property::factory()->published()->create([
            'title' => 'Test listing',
            'description' => 'Sample description',
            'price' => 12_345_678,
        ]);

        $payload = $property->toSearchableArray();

        // TCK-280 — the payload carries every field Meilisearch searches,
        // filters or sorts on (price, agency_id, etc. are public listing data).
        foreach ([
            'id', 'title', 'description', 'type', 'contract_type', 'rent_period',
            'status', 'city', 'price', 'bedrooms', 'agency_id', 'published_at',
        ] as $key) {
            $this->assertArrayHasKey($key, $payload);
        }

        // Free-form metadata is never indexed.
        $this->assertArrayNotHasKey('metadata', $payload);
    }

    public function test_draft_properties_are_not_indexed(): void
    {
        Property::factory()->draft()->create([
            'title' => 'Hidden draft villa',
            'visibility' => PropertyVisibility::Private,
            'status' => PropertyStatus::Draft,
        ]);

        $results = Property::search('villa')->get();

        $this->assertCount(0, $results);
    }
}

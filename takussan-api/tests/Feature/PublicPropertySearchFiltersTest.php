<?php

namespace Tests\Feature;

use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\InteractsWithMeilisearch;

/**
 * TCK-128 — floor_number and available_from filters on /public/properties/search.
 */
class PublicPropertySearchFiltersTest extends ApiTestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    // ─────────────────────────────────────────────────────────────────────
    // floor_number filter
    // ─────────────────────────────────────────────────────────────────────

    public function test_floor_number_filter_returns_matching_properties(): void
    {
        Property::factory()->create([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'floor_number' => 2,
            'title' => 'On floor 2',
            'published_at' => now(),
        ]);
        Property::factory()->create([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'floor_number' => 5,
            'title' => 'On floor 5',
            'published_at' => now(),
        ]);
        $this->indexProperties();

        $response = $this->getJson('/api/public/properties/search?floor_number=2');

        $response->assertOk();
        $data = $response->json('data');
        $this->assertCount(1, $data);
        $this->assertSame('On floor 2', $data[0]['title']);
    }

    public function test_floor_number_filter_excludes_null_floor(): void
    {
        Property::factory()->create([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'floor_number' => null,
            'title' => 'No floor',
            'published_at' => now(),
        ]);
        $this->indexProperties();

        $response = $this->getJson('/api/public/properties/search?floor_number=1');

        $response->assertOk();
        $this->assertCount(0, $response->json('data'));
    }

    // ─────────────────────────────────────────────────────────────────────
    // available_from filter
    // ─────────────────────────────────────────────────────────────────────

    public function test_available_from_filter_includes_property_already_available(): void
    {
        Property::factory()->create([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'available_from' => now()->subMonth()->toDateString(),
            'title' => 'Already available',
            'published_at' => now(),
        ]);
        $this->indexProperties();

        $response = $this->getJson('/api/public/properties/search?available_from='.now()->addDays(30)->toDateString());

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
    }

    public function test_available_from_filter_includes_property_with_null_available_from(): void
    {
        Property::factory()->create([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'available_from' => null,
            'title' => 'Always available',
            'published_at' => now(),
        ]);
        $this->indexProperties();

        $response = $this->getJson('/api/public/properties/search?available_from='.now()->addDays(30)->toDateString());

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
    }

    public function test_available_from_filter_excludes_property_not_yet_available(): void
    {
        Property::factory()->create([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'available_from' => now()->addYear()->toDateString(),
            'title' => 'Not yet available',
            'published_at' => now(),
        ]);
        $this->indexProperties();

        $response = $this->getJson('/api/public/properties/search?available_from='.now()->addDays(30)->toDateString());

        $response->assertOk();
        $this->assertCount(0, $response->json('data'));
    }

    public function test_invalid_available_from_returns_validation_error(): void
    {
        $response = $this->getJson('/api/public/properties/search?available_from=not-a-date');

        $response->assertUnprocessable();
    }
}

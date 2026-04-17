<?php

namespace Tests\Feature\Public;

use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PropertyDetailTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_full_property_detail(): void
    {
        $property = Property::factory()->published()->create();

        $response = $this->getJson("/api/public/properties/{$property->slug}");

        $response->assertOk()
            ->assertJsonStructure([
                'data' => ['id', 'title', 'slug', 'price', 'type', 'location', 'bedrooms', 'area', 'description'],
            ]);
    }

    public function test_returns_404_for_unknown_slug(): void
    {
        $response = $this->getJson('/api/public/properties/slug-inexistant-xyz');
        $response->assertNotFound();
    }

    public function test_draft_property_returns_404(): void
    {
        $property = Property::factory()->draft()->create();

        $response = $this->getJson("/api/public/properties/{$property->slug}");
        $response->assertNotFound();
    }
}

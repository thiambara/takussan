<?php

namespace Tests\Feature\Public;

use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PropertyListTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_paginated_published_properties(): void
    {
        Property::factory()->count(25)->published()->create();
        Property::factory()->count(3)->draft()->create();

        $response = $this->getJson('/api/public/properties');

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [['id', 'title', 'slug', 'price', 'type', 'location', 'bedrooms', 'area', 'featured']],
                'meta' => ['current_page', 'last_page', 'per_page', 'total'],
            ])
            ->assertJsonCount(20, 'data')
            ->assertJsonPath('meta.total', 25);
    }

    public function test_draft_properties_are_excluded(): void
    {
        Property::factory()->draft()->create();

        $response = $this->getJson('/api/public/properties');

        $response->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_featured_properties_appear_first(): void
    {
        Property::factory()->count(5)->published()->create(['featured' => false]);
        $featured = Property::factory()->published()->featured()->create();

        $response = $this->getJson('/api/public/properties');

        $response->assertOk();
        $this->assertEquals($featured->id, $response->json('data.0.id'));
    }

    public function test_no_auth_required(): void
    {
        $response = $this->getJson('/api/public/properties');
        $response->assertOk();
    }

    public function test_featured_filter_returns_only_featured_properties(): void
    {
        Property::factory()->count(3)->published()->create(['featured' => false]);
        Property::factory()->count(2)->published()->featured()->create();

        $response = $this->getJson('/api/public/properties?featured=true');

        $response->assertOk()->assertJsonCount(2, 'data');
        foreach ($response->json('data') as $item) {
            $this->assertTrue((bool) $item['featured']);
        }
    }

    public function test_sort_created_desc_returns_newest_first(): void
    {
        $old = Property::factory()->published()->create(['featured' => true, 'created_at' => now()->subDays(10)]);
        $new = Property::factory()->published()->create(['featured' => false, 'created_at' => now()]);

        $response = $this->getJson('/api/public/properties?sort=created_desc');

        $response->assertOk();
        $this->assertEquals($new->id, $response->json('data.0.id'),
            'Newest property should appear first when sort=created_desc');
        $this->assertEquals($old->id, $response->json('data.1.id'));
    }
}

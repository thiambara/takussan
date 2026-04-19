<?php

namespace Tests\Feature\Public;

use App\Models\Address;
use App\Models\Enums\PropertyType;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PropertySimilarTest extends TestCase
{
    use RefreshDatabase;

    public function test_similar_returns_matching_properties_with_same_type_and_price_range(): void
    {
        $reference = Property::factory()->published()->create([
            'type' => PropertyType::Villa,
            'price' => 100_000_000,
        ]);
        Address::factory()->create([
            'addressable_id' => $reference->id,
            'addressable_type' => Property::class,
            'city' => 'Dakar',
        ]);

        foreach (range(1, 5) as $i) {
            $p = Property::factory()->published()->create([
                'type' => PropertyType::Villa,
                'price' => 100_000_000,
            ]);
            Address::factory()->create([
                'addressable_id' => $p->id,
                'addressable_type' => Property::class,
                'city' => 'Dakar',
            ]);
        }

        $response = $this->getJson("/api/public/properties/{$reference->slug}/similar");

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertLessThanOrEqual(6, count($ids));
        $this->assertNotContains($reference->id, $ids);
        foreach ($response->json('data') as $item) {
            $this->assertSame('villa', $item['type']);
        }
    }

    public function test_similar_excludes_different_type(): void
    {
        $reference = Property::factory()->published()->create([
            'type' => PropertyType::Villa,
            'price' => 100_000_000,
        ]);
        Property::factory()->published()->create([
            'type' => PropertyType::Apartment,
            'price' => 100_000_000,
        ]);

        $response = $this->getJson("/api/public/properties/{$reference->slug}/similar");

        $response->assertOk();
        $this->assertCount(0, $response->json('data'));
    }

    public function test_similar_excludes_draft_properties(): void
    {
        $reference = Property::factory()->published()->create([
            'type' => PropertyType::Villa,
            'price' => 100_000_000,
        ]);
        Property::factory()->draft()->create([
            'type' => PropertyType::Villa,
            'price' => 100_000_000,
        ]);

        $response = $this->getJson("/api/public/properties/{$reference->slug}/similar");

        $response->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_similar_returns_404_for_unknown_slug(): void
    {
        $response = $this->getJson('/api/public/properties/unknown-slug/similar');

        $response->assertNotFound();
    }
}

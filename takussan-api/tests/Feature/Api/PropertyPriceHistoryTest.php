<?php

namespace Tests\Feature\Api;

use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PropertyPriceHistoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_list_price_history(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id, 'price' => 1_000_000]);

        Sanctum::actingAs($owner);

        // Trigger price history by updating price
        $property->update(['price' => 1_200_000]);

        $this->getJson("/api/properties/{$property->id}/price-history")
            ->assertOk()
            ->assertJsonStructure(['data', 'meta']);
    }

    public function test_price_history_is_empty_when_no_changes(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($owner);

        $response = $this->getJson("/api/properties/{$property->id}/price-history")
            ->assertOk();

        $this->assertEmpty($response->json('data'));
    }

    public function test_unrelated_user_cannot_view_price_history(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($other);

        $this->getJson("/api/properties/{$property->id}/price-history")
            ->assertForbidden();
    }

    public function test_price_history_tracks_changes(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id, 'price' => 500_000]);

        $property->update(['price' => 600_000]);
        $property->update(['price' => 700_000]);

        Sanctum::actingAs($owner);

        $response = $this->getJson("/api/properties/{$property->id}/price-history")->assertOk();

        $this->assertGreaterThanOrEqual(2, $response->json('meta.total'));
    }
}

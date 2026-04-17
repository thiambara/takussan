<?php

namespace Tests\Feature\Api;

use App\Models\Favorite;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FavoriteTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_add_and_list_favorites(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create();

        Sanctum::actingAs($user);

        $this->postJson('/api/favorites', ['property_id' => $property->id])
            ->assertCreated()
            ->assertJsonPath('data.property_id', $property->id);

        $this->getJson('/api/favorites')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    public function test_adding_same_property_twice_is_idempotent(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create();

        Sanctum::actingAs($user);

        $this->postJson('/api/favorites', ['property_id' => $property->id])->assertCreated();
        $this->postJson('/api/favorites', ['property_id' => $property->id])->assertCreated();

        $this->assertDatabaseCount('favorites', 1);
    }

    public function test_user_can_remove_favorite(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create();
        Favorite::create(['user_id' => $user->id, 'property_id' => $property->id]);

        Sanctum::actingAs($user);

        $this->deleteJson("/api/favorites/{$property->id}")->assertNoContent();
        $this->assertDatabaseCount('favorites', 0);
    }
}

<?php

namespace Tests\Feature\Api;

use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PropertyCrudTest extends TestCase
{
    use RefreshDatabase;

    public function test_requires_auth(): void
    {
        $this->getJson('/api/properties')->assertUnauthorized();
    }

    public function test_lists_only_owner_properties(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();

        Property::factory()->count(3)->create(['user_id' => $me->id]);
        Property::factory()->count(5)->create(['user_id' => $other->id]);

        Sanctum::actingAs($me);

        $this->getJson('/api/properties')
            ->assertOk()
            ->assertJsonPath('meta.total', 3);
    }

    public function test_creates_property_with_address(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/properties', [
            'title' => 'Joli appartement',
            'description' => 'Vue mer',
            'type' => 'apartment',
            'contract_type' => 'rent',
            'price' => 300000,
            'currency' => 'XOF',
            'bedrooms' => 3,
            'bathrooms' => 2,
            'area' => 80,
            'address' => [
                'city' => 'Dakar',
                'neighborhood' => 'Almadies',
                'country' => 'SN',
            ],
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.title', 'Joli appartement')
            ->assertJsonPath('data.location.quarter', 'Almadies');

        $this->assertDatabaseCount('properties', 1);
        $this->assertDatabaseCount('addresses', 1);
    }

    public function test_publishes_property(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->draft()->create(['user_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->postJson("/api/properties/{$property->id}/publish")
            ->assertOk()
            ->assertJsonPath('data.status', 'available')
            ->assertJsonPath('data.visibility', 'public');
    }

    public function test_cannot_access_other_user_property(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $other->id]);

        Sanctum::actingAs($me);

        $this->getJson("/api/properties/{$property->id}")->assertForbidden();
    }
}

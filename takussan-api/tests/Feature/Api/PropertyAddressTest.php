<?php

namespace Tests\Feature\Api;

use App\Models\Address;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PropertyAddressTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_create_address_via_upsert(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($owner);

        $this->putJson("/api/properties/{$property->id}/address", [
            'street' => '12 rue des Almadies',
            'neighborhood' => 'Almadies',
            'city' => 'Dakar',
            'country' => 'SN',
            'latitude' => 14.7392,
            'longitude' => -17.5048,
        ])->assertStatus(201)
            ->assertJsonPath('data.city', 'Dakar')
            ->assertJsonPath('data.neighborhood', 'Almadies');

        $this->assertDatabaseHas('addresses', [
            'addressable_id' => $property->id,
            'addressable_type' => Property::class,
            'neighborhood' => 'Almadies',
        ]);
    }

    public function test_owner_can_update_existing_address_via_upsert(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        Address::create([
            'addressable_id' => $property->id,
            'addressable_type' => Property::class,
            'street' => 'old street',
            'city' => 'Dakar',
            'country' => 'SN',
        ]);

        Sanctum::actingAs($owner);

        $this->putJson("/api/properties/{$property->id}/address", [
            'street' => 'new street',
            'city' => 'Saint-Louis',
            'country' => 'SN',
        ])->assertOk()
            ->assertJsonPath('data.street', 'new street')
            ->assertJsonPath('data.city', 'Saint-Louis');

        $this->assertDatabaseCount('addresses', 1);
        $this->assertDatabaseHas('addresses', [
            'addressable_id' => $property->id,
            'street' => 'new street',
            'city' => 'Saint-Louis',
        ]);
    }

    public function test_owner_can_detach_address(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        Address::create([
            'addressable_id' => $property->id,
            'addressable_type' => Property::class,
            'city' => 'Dakar',
            'country' => 'SN',
        ]);

        Sanctum::actingAs($owner);

        $this->deleteJson("/api/properties/{$property->id}/address")
            ->assertNoContent();

        $this->assertDatabaseMissing('addresses', [
            'addressable_id' => $property->id,
            'addressable_type' => Property::class,
        ]);
    }

    public function test_random_user_cannot_upsert_address(): void
    {
        $property = Property::factory()->create();

        Sanctum::actingAs(User::factory()->create());

        $this->putJson("/api/properties/{$property->id}/address", [
            'city' => 'Dakar',
        ])->assertForbidden();
    }

    public function test_upsert_validates_latitude_range(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($owner);

        $this->putJson("/api/properties/{$property->id}/address", [
            'latitude' => 200,
        ])->assertStatus(422);
    }
}

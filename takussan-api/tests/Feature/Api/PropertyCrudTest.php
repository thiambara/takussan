<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
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

    public function test_filters_property_portfolio_by_city_price_date_and_assigned_agent(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->withAgentProfile($agency)->create();
        $otherAgent = User::factory()->withAgentProfile($agency)->create();

        $match = Property::factory()->create([
            'user_id' => $agent->id,
            'agency_id' => $agency->id,
            'price' => 450000,
            'created_at' => '2026-05-06 10:00:00',
        ]);
        $match->address()->create(['city' => 'Dakar', 'country' => 'SN']);

        $outsideCity = Property::factory()->create([
            'user_id' => $agent->id,
            'agency_id' => $agency->id,
            'price' => 450000,
            'created_at' => '2026-05-06 10:00:00',
        ]);
        $outsideCity->address()->create(['city' => 'Thiès', 'country' => 'SN']);

        Property::factory()->create([
            'user_id' => $otherAgent->id,
            'agency_id' => $agency->id,
            'price' => 450000,
            'created_at' => '2026-05-06 10:00:00',
        ])->address()->create(['city' => 'Dakar', 'country' => 'SN']);

        Sanctum::actingAs($agent);

        $this->getJson('/api/properties?filter[city]=Dak&filter[price_min]=400000&filter[price_max]=500000&filter[created_from]=2026-05-01&filter[created_to]=2026-05-31&filter[user_id]='.$agent->id)
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $match->id);
    }

    public function test_assigns_property_agent_inside_active_agency(): void
    {
        $agency = Agency::factory()->create();
        $owner = User::factory()->withAgentProfile($agency)->create();
        $target = User::factory()->withAgentProfile($agency)->create();
        $property = Property::factory()->create([
            'user_id' => $owner->id,
            'agency_id' => $agency->id,
        ]);

        Sanctum::actingAs($owner);

        $this->putJson("/api/properties/{$property->id}/assigned-agent", [
            'user_id' => $target->id,
        ])->assertOk()
            ->assertJsonPath('data.owner.id', $target->id);

        $this->assertDatabaseHas('properties', [
            'id' => $property->id,
            'user_id' => $target->id,
        ]);
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
            'rent_period' => 'monthly',
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
            ->assertJsonPath('data.rent_period', 'monthly')
            ->assertJsonPath('data.location.quarter', 'Almadies');

        $this->assertDatabaseCount('properties', 1);
        $this->assertDatabaseHas('properties', ['rent_period' => 'monthly']);
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

    public function test_visibility_endpoint_publishes_draft_property(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->draft()->create(['user_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->putJson("/api/properties/{$property->id}/visibility", ['visibility' => 'public'])
            ->assertOk()
            ->assertJsonPath('data.status', 'available')
            ->assertJsonPath('data.visibility', 'public');

        $property->refresh();
        $this->assertNotNull($property->published_at);
    }

    public function test_visibility_endpoint_unpublishes_public_property(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create([
            'user_id' => $user->id,
            'status' => 'available',
            'visibility' => 'public',
            'published_at' => now(),
        ]);

        Sanctum::actingAs($user);

        $this->putJson("/api/properties/{$property->id}/visibility", ['visibility' => 'private'])
            ->assertOk()
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.visibility', 'private');

        $this->assertNull($property->refresh()->published_at);
    }

    public function test_status_endpoint_archives_property_and_removes_public_visibility(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create([
            'user_id' => $user->id,
            'status' => 'available',
            'visibility' => 'public',
            'published_at' => now(),
        ]);

        Sanctum::actingAs($user);

        $this->putJson("/api/properties/{$property->id}/status", ['status' => 'archived'])
            ->assertOk()
            ->assertJsonPath('data.status', 'archived')
            ->assertJsonPath('data.visibility', 'private');

        $property->refresh();
        $this->assertNull($property->published_at);
        $this->assertNotNull($property->archived_at);
    }

    public function test_cannot_access_other_user_property(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $other->id]);

        Sanctum::actingAs($me);

        $this->getJson("/api/properties/{$property->id}")->assertForbidden();
    }

    public function test_updates_property(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $user->id, 'title' => 'Old Title']);

        Sanctum::actingAs($user);

        $this->putJson("/api/properties/{$property->id}", [
            'title' => 'New Title',
            'price' => 500000,
        ])->assertOk()->assertJsonPath('data.title', 'New Title');

        $this->assertDatabaseHas('properties', ['id' => $property->id, 'title' => 'New Title', 'price' => 500000]);
    }

    public function test_deletes_property(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->deleteJson("/api/properties/{$property->id}")->assertNoContent();

        $this->assertSoftDeleted('properties', ['id' => $property->id]);
    }

    public function test_cannot_publish_sold_or_rented_property(): void
    {
        $user = User::factory()->create();

        $propertySold = Property::factory()->create([
            'user_id' => $user->id,
            'status' => PropertyStatus::Sold->value,
        ]);

        $propertyRented = Property::factory()->create([
            'user_id' => $user->id,
            'status' => PropertyStatus::Rented->value,
        ]);

        Sanctum::actingAs($user);

        $this->postJson("/api/properties/{$propertySold->id}/publish")->assertUnprocessable();
        $this->postJson("/api/properties/{$propertyRented->id}/publish")->assertUnprocessable();
    }

    public function test_negative_price_returns_422(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/properties', [
            'title' => 'Test',
            'type' => 'apartment',
            'contract_type' => 'rent',
            'price' => -1000,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['price']);
    }

    public function test_negative_bedrooms_returns_422(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/properties', [
            'title' => 'Test',
            'type' => 'apartment',
            'contract_type' => 'rent',
            'price' => 500000,
            'bedrooms' => -1,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['bedrooms']);
    }
}

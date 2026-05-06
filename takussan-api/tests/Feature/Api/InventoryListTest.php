<?php

namespace Tests\Feature\Api;

use App\Models\Enums\InventoryType;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class InventoryListTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_lists_inventories_for_property(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $otherProperty = Property::factory()->create(['user_id' => $owner->id]);

        Inventory::factory()->count(2)->create([
            'property_id' => $property->id,
            'conducted_by' => $owner->id,
        ]);
        Inventory::factory()->create([
            'property_id' => $otherProperty->id,
            'conducted_by' => $owner->id,
        ]);

        Sanctum::actingAs($owner);

        $this->getJson("/api/properties/{$property->id}/inventories")
            ->assertOk()
            ->assertJsonPath('meta.total', 2);
    }

    public function test_unauthorized_user_cannot_list_property_inventories(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        Inventory::factory()->create([
            'property_id' => $property->id,
            'conducted_by' => $owner->id,
        ]);

        Sanctum::actingAs(User::factory()->create());

        $this->getJson("/api/properties/{$property->id}/inventories")
            ->assertForbidden();
    }

    public function test_property_inventories_can_be_filtered_by_type(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        Inventory::factory()->create([
            'property_id' => $property->id,
            'conducted_by' => $owner->id,
            'type' => InventoryType::MoveIn,
        ]);
        Inventory::factory()->moveOut()->create([
            'property_id' => $property->id,
            'conducted_by' => $owner->id,
        ]);

        Sanctum::actingAs($owner);

        $this->getJson("/api/properties/{$property->id}/inventories?filter[type]=".InventoryType::MoveOut->value)
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.type', InventoryType::MoveOut->value);
    }

    public function test_inventory_list_exposes_property_and_lease_labels(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create([
            'user_id' => $owner->id,
            'title' => 'Appartement Plateau',
            'slug' => 'appartement-plateau',
        ]);
        $lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $owner->id,
            'reference_number' => 'LS-PLATEAU-001',
        ]);
        Inventory::factory()->create([
            'lease_id' => $lease->id,
            'property_id' => $property->id,
            'conducted_by' => $owner->id,
        ]);

        Sanctum::actingAs($owner);

        $this->getJson('/api/inventories')
            ->assertOk()
            ->assertJsonPath('data.0.property.title', 'Appartement Plateau')
            ->assertJsonPath('data.0.property.slug', 'appartement-plateau')
            ->assertJsonPath('data.0.lease.reference_number', 'LS-PLATEAU-001');
    }

    public function test_inventory_detail_exposes_property_and_lease_labels(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create([
            'user_id' => $owner->id,
            'title' => 'Studio Almadies',
            'slug' => 'studio-almadies',
        ]);
        $lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $owner->id,
            'reference_number' => 'LS-ALMADIES-002',
        ]);
        $inventory = Inventory::factory()->create([
            'lease_id' => $lease->id,
            'property_id' => $property->id,
            'conducted_by' => $owner->id,
        ]);

        Sanctum::actingAs($owner);

        $this->getJson("/api/inventories/{$inventory->id}")
            ->assertOk()
            ->assertJsonPath('data.property.title', 'Studio Almadies')
            ->assertJsonPath('data.property.slug', 'studio-almadies')
            ->assertJsonPath('data.lease.reference_number', 'LS-ALMADIES-002');
    }
}

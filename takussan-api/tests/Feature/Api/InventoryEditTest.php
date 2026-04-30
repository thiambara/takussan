<?php

namespace Tests\Feature\Api;

use App\Models\Enums\InventoryStatus;
use App\Models\Inventory;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class InventoryEditTest extends TestCase
{
    use RefreshDatabase;

    public function test_can_edit_notes_of_draft_inventory(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $inventory = Inventory::factory()->create([
            'property_id' => $property->id,
            'conducted_by' => $owner->id,
            'status' => InventoryStatus::Draft,
        ]);

        Sanctum::actingAs($owner);

        $this->patchJson("/api/inventories/{$inventory->id}", [
            'notes' => 'Nouvelles observations',
        ])->assertOk()
            ->assertJsonPath('data.notes', 'Nouvelles observations');
    }

    public function test_can_update_rooms_with_elements(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $inventory = Inventory::factory()->create([
            'property_id' => $property->id,
            'conducted_by' => $owner->id,
            'status' => InventoryStatus::Draft,
        ]);

        Sanctum::actingAs($owner);

        $this->patchJson("/api/inventories/{$inventory->id}", [
            'rooms' => [
                [
                    'name' => 'Salon',
                    'condition' => 'good',
                    'elements' => [
                        ['label' => 'Canapé', 'state' => 'endommagé', 'notes' => 'tache sur assise'],
                    ],
                ],
            ],
        ])->assertOk()
            ->assertJsonPath('data.rooms.0.elements.0.state', 'endommagé')
            ->assertJsonPath('data.rooms.0.elements.0.notes', 'tache sur assise');
    }

    public function test_cannot_edit_signed_inventory(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $inventory = Inventory::factory()->signed()->create([
            'property_id' => $property->id,
            'conducted_by' => $owner->id,
        ]);

        Sanctum::actingAs($owner);

        // TCK-076 AC5 — signed inventories return 409 on PATCH.
        $this->patchJson("/api/inventories/{$inventory->id}", [
            'notes' => 'trying to tamper',
        ])->assertStatus(409);
    }

    public function test_cannot_edit_pending_signature_inventory(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $inventory = Inventory::factory()->pendingSignature()->create([
            'property_id' => $property->id,
            'conducted_by' => $owner->id,
        ]);

        Sanctum::actingAs($owner);

        $this->patchJson("/api/inventories/{$inventory->id}", [
            'notes' => 'too late',
        ])->assertStatus(422);
    }

    public function test_non_manager_cannot_edit_inventory(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $inventory = Inventory::factory()->create([
            'property_id' => $property->id,
            'conducted_by' => $owner->id,
            'status' => InventoryStatus::Draft,
        ]);

        Sanctum::actingAs(User::factory()->create());

        $this->patchJson("/api/inventories/{$inventory->id}", [
            'notes' => 'hack',
        ])->assertForbidden();
    }
}

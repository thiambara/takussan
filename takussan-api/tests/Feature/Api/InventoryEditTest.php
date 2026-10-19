<?php

namespace Tests\Feature\Api;

use App\Models\Enums\InventoryStatus;
use App\Models\Inventory;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
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

    /**
     * P54.05 (TCK-980) — `general_condition` et `rooms` sont `NOT NULL` sans défaut :
     * un `null` n'est pas un effacement possible, il rend 422 et l'état des lieux reste intact.
     *
     * @return array<string, array{string}>
     */
    public static function clesNonEffacables(): array
    {
        return [
            'general_condition' => ['general_condition'],
            'rooms' => ['rooms'],
        ];
    }

    #[DataProvider('clesNonEffacables')]
    public function test_null_on_a_not_null_column_is_rejected_with_422(string $cle): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $inventory = Inventory::factory()->create([
            'property_id' => $property->id,
            'conducted_by' => $owner->id,
            'status' => InventoryStatus::Draft,
        ]);
        $avant = $inventory->fresh()->only(['general_condition', 'rooms', 'notes']);

        Sanctum::actingAs($owner);

        $this->patchJson("/api/inventories/{$inventory->id}", [$cle => null])
            ->assertStatus(422)
            ->assertJsonValidationErrors([$cle]);

        $this->assertSame($avant, $inventory->fresh()->only(['general_condition', 'rooms', 'notes']));
    }

    public function test_null_notes_still_clears_them(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $inventory = Inventory::factory()->create([
            'property_id' => $property->id,
            'conducted_by' => $owner->id,
            'status' => InventoryStatus::Draft,
            'notes' => 'À effacer',
        ]);

        Sanctum::actingAs($owner);

        $this->patchJson("/api/inventories/{$inventory->id}", ['notes' => null])
            ->assertOk()
            ->assertJsonPath('data.notes', null);

        $this->assertNull($inventory->fresh()->notes);
    }
}

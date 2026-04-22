<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Enums\InventoryCondition;
use App\Models\Enums\InventoryType;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class InventoryItemsValidationTest extends TestCase
{
    use RefreshDatabase;

    protected function lease(User $owner): Lease
    {
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $tenant = Customer::factory()->create();

        return Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $owner->id,
            'tenant_id' => $tenant->id,
        ]);
    }

    public function test_rooms_is_required(): void
    {
        $owner = User::factory()->create();
        $lease = $this->lease($owner);

        Sanctum::actingAs($owner);

        $this->postJson('/api/inventories', [
            'lease_id' => $lease->id,
            'type' => InventoryType::MoveIn->value,
            'general_condition' => InventoryCondition::Good->value,
            'rooms' => [],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('rooms');
    }

    public function test_room_name_is_required(): void
    {
        $owner = User::factory()->create();
        $lease = $this->lease($owner);

        Sanctum::actingAs($owner);

        $this->postJson('/api/inventories', [
            'lease_id' => $lease->id,
            'type' => InventoryType::MoveIn->value,
            'general_condition' => InventoryCondition::Good->value,
            'rooms' => [['condition' => 'good']],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('rooms.0.name');
    }

    public function test_element_label_required_when_elements_provided(): void
    {
        $owner = User::factory()->create();
        $lease = $this->lease($owner);

        Sanctum::actingAs($owner);

        $this->postJson('/api/inventories', [
            'lease_id' => $lease->id,
            'type' => InventoryType::MoveIn->value,
            'general_condition' => InventoryCondition::Good->value,
            'rooms' => [
                [
                    'name' => 'Salon',
                    'condition' => 'good',
                    'elements' => [
                        ['state' => 'bon'], // missing label
                    ],
                ],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('rooms.0.elements.0.label');
    }

    public function test_element_state_must_be_in_allowed_set(): void
    {
        $owner = User::factory()->create();
        $lease = $this->lease($owner);

        Sanctum::actingAs($owner);

        $this->postJson('/api/inventories', [
            'lease_id' => $lease->id,
            'type' => InventoryType::MoveIn->value,
            'general_condition' => InventoryCondition::Good->value,
            'rooms' => [
                [
                    'name' => 'Salon',
                    'condition' => 'good',
                    'elements' => [
                        ['label' => 'Canapé', 'state' => 'nuclear_melt_down'],
                    ],
                ],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('rooms.0.elements.0.state');
    }

    public function test_valid_payload_with_all_four_states(): void
    {
        $owner = User::factory()->create();
        $lease = $this->lease($owner);

        Sanctum::actingAs($owner);

        $this->postJson('/api/inventories', [
            'lease_id' => $lease->id,
            'type' => InventoryType::MoveIn->value,
            'general_condition' => InventoryCondition::Good->value,
            'rooms' => [
                [
                    'name' => 'Salon',
                    'condition' => 'good',
                    'elements' => [
                        ['label' => 'A', 'state' => 'bon'],
                        ['label' => 'B', 'state' => 'usé'],
                        ['label' => 'C', 'state' => 'endommagé'],
                        ['label' => 'D', 'state' => 'manquant'],
                    ],
                ],
            ],
        ])->assertCreated();
    }
}

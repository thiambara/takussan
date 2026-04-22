<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Enums\InventoryCondition;
use App\Models\Enums\InventoryStatus;
use App\Models\Enums\InventoryType;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class InventoryCreationTest extends TestCase
{
    use RefreshDatabase;

    public function test_landlord_creates_check_in_inventory_with_rooms_and_elements(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $tenant = Customer::factory()->create();
        $lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $owner->id,
            'tenant_id' => $tenant->id,
        ]);

        Sanctum::actingAs($owner);

        $payload = [
            'lease_id' => $lease->id,
            'type' => InventoryType::MoveIn->value,
            'general_condition' => InventoryCondition::Good->value,
            'rooms' => [
                [
                    'name' => 'Salon',
                    'condition' => 'good',
                    'elements' => [
                        ['label' => 'Canapé', 'state' => 'bon'],
                        ['label' => 'Table basse', 'state' => 'usé', 'notes' => 'griffures'],
                    ],
                ],
                [
                    'name' => 'Cuisine',
                    'condition' => 'fair',
                ],
            ],
            'notes' => 'État général correct.',
        ];

        $this->postJson('/api/inventories', $payload)
            ->assertCreated()
            ->assertJsonPath('data.type', InventoryType::MoveIn->value)
            ->assertJsonPath('data.status', InventoryStatus::Draft->value)
            ->assertJsonPath('data.rooms.0.elements.0.label', 'Canapé')
            ->assertJsonPath('data.rooms.0.elements.1.state', 'usé');
    }

    public function test_can_create_check_out_inventory(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $tenant = Customer::factory()->create();
        $lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $owner->id,
            'tenant_id' => $tenant->id,
        ]);

        Sanctum::actingAs($owner);

        $this->postJson('/api/inventories', [
            'lease_id' => $lease->id,
            'type' => InventoryType::MoveOut->value,
            'general_condition' => InventoryCondition::Fair->value,
            'rooms' => [
                ['name' => 'Salon', 'condition' => 'fair'],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.type', InventoryType::MoveOut->value);
    }

    public function test_unauthorized_user_cannot_create_inventory(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $tenant = Customer::factory()->create();
        $lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $owner->id,
            'tenant_id' => $tenant->id,
        ]);

        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/inventories', [
            'lease_id' => $lease->id,
            'type' => InventoryType::MoveIn->value,
            'general_condition' => InventoryCondition::Good->value,
            'rooms' => [['name' => 'Salon', 'condition' => 'good']],
        ])->assertForbidden();
    }
}

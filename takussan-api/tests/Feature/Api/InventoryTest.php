<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Enums\InventoryCondition;
use App\Models\Enums\InventoryStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class InventoryTest extends TestCase
{
    use RefreshDatabase;

    private const SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAvMBAOeufn4AAAAASUVORK5CYII=';

    public function test_submit_transitions_draft_to_pending_signature(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $inventory = Inventory::factory()->create([
            'property_id' => $property->id,
            'conducted_by' => $owner->id,
            'status' => InventoryStatus::Draft,
        ]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/inventories/{$inventory->id}/submit")
            ->assertOk()
            ->assertJsonPath('data.status', InventoryStatus::PendingSignature->value);
    }

    public function test_cannot_dispute_draft(): void
    {
        $owner = User::factory()->create();
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $inventory = Inventory::factory()->create([
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'conducted_by' => $owner->id,
            'status' => InventoryStatus::Draft,
        ]);

        Sanctum::actingAs($tenantUser);

        $this->postJson("/api/inventories/{$inventory->id}/dispute", [
            'reason' => 'nope',
        ])->assertStatus(422);
    }

    public function test_invalid_type_returns_422(): void
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
            'type' => 'invalid',
            'general_condition' => InventoryCondition::Good->value,
            'rooms' => [['name' => 'Living', 'condition' => 'good']],
        ])->assertStatus(422);
    }

    public function test_can_list_inventories(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        Inventory::factory()->count(3)->create([
            'property_id' => $property->id,
            'conducted_by' => $owner->id,
        ]);

        Sanctum::actingAs($owner);

        $this->getJson('/api/inventories')
            ->assertOk()
            ->assertJsonPath('meta.total', 3);
    }
}

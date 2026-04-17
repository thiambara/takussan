<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Enums\InventoryCondition;
use App\Models\Enums\InventoryStatus;
use App\Models\Enums\InventoryType;
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

    public function test_landlord_can_create_move_in_inventory(): void
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
            'type' => InventoryType::MoveIn->value,
            'general_condition' => InventoryCondition::Good->value,
            'rooms' => [
                ['name' => 'Living', 'condition' => 'good'],
                ['name' => 'Kitchen', 'condition' => 'fair'],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.status', InventoryStatus::Draft->value)
            ->assertJsonPath('data.type', InventoryType::MoveIn->value);

        $this->assertDatabaseCount('inventories', 1);
    }

    public function test_random_user_cannot_create_inventory(): void
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
            'rooms' => [['name' => 'Living', 'condition' => 'good']],
        ])->assertForbidden();
    }

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

    public function test_cannot_submit_non_draft_inventory(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $inventory = Inventory::factory()->create([
            'property_id' => $property->id,
            'conducted_by' => $owner->id,
            'status' => InventoryStatus::PendingSignature,
        ]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/inventories/{$inventory->id}/submit")->assertStatus(422);
    }

    public function test_update_only_allowed_on_draft(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $inventory = Inventory::factory()->create([
            'property_id' => $property->id,
            'conducted_by' => $owner->id,
            'status' => InventoryStatus::Signed,
        ]);

        Sanctum::actingAs($owner);

        $this->patchJson("/api/inventories/{$inventory->id}", [
            'notes' => 'update attempt',
        ])->assertStatus(422);
    }

    public function test_owner_signs_then_tenant_signs_marks_signed(): void
    {
        $owner = User::factory()->create();
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $inventory = Inventory::factory()->create([
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'conducted_by' => $owner->id,
            'status' => InventoryStatus::PendingSignature,
        ]);

        Sanctum::actingAs($owner);
        $this->postJson("/api/inventories/{$inventory->id}/sign")
            ->assertOk()
            ->assertJsonPath('data.owner_signed', true)
            ->assertJsonPath('data.status', InventoryStatus::PendingSignature->value);

        Sanctum::actingAs($tenantUser);
        $this->postJson("/api/inventories/{$inventory->id}/sign")
            ->assertOk()
            ->assertJsonPath('data.tenant_signed', true)
            ->assertJsonPath('data.status', InventoryStatus::Signed->value);
    }

    public function test_random_user_cannot_sign_inventory(): void
    {
        $owner = User::factory()->create();
        $tenant = Customer::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $inventory = Inventory::factory()->create([
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'conducted_by' => $owner->id,
            'status' => InventoryStatus::PendingSignature,
        ]);

        Sanctum::actingAs(User::factory()->create());

        $this->postJson("/api/inventories/{$inventory->id}/sign")->assertForbidden();
    }

    public function test_tenant_can_dispute_pending_inventory(): void
    {
        $owner = User::factory()->create();
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $inventory = Inventory::factory()->create([
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'conducted_by' => $owner->id,
            'status' => InventoryStatus::PendingSignature,
        ]);

        Sanctum::actingAs($tenantUser);

        $this->postJson("/api/inventories/{$inventory->id}/dispute", [
            'reason' => 'Kitchen actually in poor condition',
        ])->assertOk()
            ->assertJsonPath('data.status', InventoryStatus::Disputed->value);
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
}

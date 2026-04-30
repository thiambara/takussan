<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MaintenanceRequestTest extends TestCase
{
    use RefreshDatabase;

    public function test_tenant_creates_maintenance_request(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        Lease::factory()->create([
            'property_id' => $property->id,
            'tenant_id' => $customer->id,
            'landlord_id' => $property->user_id,
            'status' => LeaseStatus::Active,
        ]);

        Sanctum::actingAs($user);

        $this->postJson('/api/maintenance-requests', [
            'property_id' => $property->id,
            'title' => 'Fuite robinet cuisine',
            'description' => 'Fuite continue',
            'category' => 'plumbing',
            'priority' => 'high',
        ])->assertCreated()
            ->assertJsonPath('data.status', 'open')
            ->assertJsonPath('data.priority', 'high');
    }

    public function test_unrelated_user_cannot_create_maintenance_request(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create();

        Sanctum::actingAs($user);

        $this->postJson('/api/maintenance-requests', [
            'property_id' => $property->id,
            'title' => 'Bogus',
            'description' => 'not a tenant',
            'category' => 'plumbing',
        ])->assertForbidden();
    }

    public function test_owner_can_update_status(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
        ]);

        Sanctum::actingAs($owner);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'status' => 'in_progress',
            'estimated_cost' => 50000,
        ])->assertOk()
            ->assertJsonPath('data.status', 'in_progress')
            ->assertJsonPath('data.estimated_cost', 50000);
    }

    public function test_owner_can_show_maintenance_request(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
        ]);

        Sanctum::actingAs($owner);

        $this->getJson("/api/maintenance-requests/{$mr->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $mr->id);
    }

    public function test_owner_can_resolve_maintenance_request(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
            'status' => 'in_progress',
        ]);

        Sanctum::actingAs($owner);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'status' => 'completed',
            'resolution_notes' => 'Fuite réparée avec succès.',
            'actual_cost' => 45000,
        ])->assertOk()
            ->assertJsonPath('data.status', 'completed');
    }

    public function test_owner_can_cancel_maintenance_request(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
        ]);

        Sanctum::actingAs($owner);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'status' => 'cancelled',
        ])->assertOk()
            ->assertJsonPath('data.status', 'cancelled');
    }
}

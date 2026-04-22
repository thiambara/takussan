<?php

namespace Tests\Feature\Api;

use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MaintenanceStatusTest extends TestCase
{
    use RefreshDatabase;

    public function test_can_transition_from_open_to_in_progress(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
            'status' => MaintenanceStatus::Open,
        ]);

        Sanctum::actingAs($owner);

        $this->putJson("/api/maintenance-requests/{$mr->id}/status", [
            'status' => MaintenanceStatus::InProgress->value,
        ])->assertOk()
            ->assertJsonPath('data.status', MaintenanceStatus::InProgress->value);

        $this->assertNotNull($mr->refresh()->started_at);
    }

    public function test_can_transition_from_in_progress_to_completed(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
            'status' => MaintenanceStatus::InProgress,
        ]);

        Sanctum::actingAs($owner);

        $this->putJson("/api/maintenance-requests/{$mr->id}/status", [
            'status' => MaintenanceStatus::Completed->value,
        ])->assertOk()
            ->assertJsonPath('data.status', MaintenanceStatus::Completed->value);

        $this->assertNotNull($mr->refresh()->completed_at);
    }

    public function test_can_transition_to_cancelled_from_open(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
            'status' => MaintenanceStatus::Open,
        ]);

        Sanctum::actingAs($owner);

        $this->putJson("/api/maintenance-requests/{$mr->id}/status", [
            'status' => MaintenanceStatus::Cancelled->value,
        ])->assertOk()
            ->assertJsonPath('data.status', MaintenanceStatus::Cancelled->value);
    }

    public function test_cannot_transition_from_completed_backwards(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
            'status' => MaintenanceStatus::Completed,
        ]);

        Sanctum::actingAs($owner);

        $this->putJson("/api/maintenance-requests/{$mr->id}/status", [
            'status' => MaintenanceStatus::Open->value,
        ])->assertStatus(422);
    }

    public function test_cannot_transition_from_cancelled(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
            'status' => MaintenanceStatus::Cancelled,
        ]);

        Sanctum::actingAs($owner);

        $this->putJson("/api/maintenance-requests/{$mr->id}/status", [
            'status' => MaintenanceStatus::InProgress->value,
        ])->assertStatus(422);
    }

    public function test_invalid_status_value_returns_422(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
        ]);

        Sanctum::actingAs($owner);

        $this->putJson("/api/maintenance-requests/{$mr->id}/status", [
            'status' => 'bogus_value',
        ])->assertStatus(422);
    }

    public function test_non_manager_cannot_change_status(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
        ]);

        Sanctum::actingAs(User::factory()->create());

        $this->putJson("/api/maintenance-requests/{$mr->id}/status", [
            'status' => MaintenanceStatus::InProgress->value,
        ])->assertForbidden();
    }
}

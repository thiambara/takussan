<?php

namespace Tests\Feature\Api;

use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MaintenanceHistoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_list_maintenance_history_for_property(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $otherProperty = Property::factory()->create(['user_id' => $owner->id]);

        MaintenanceRequest::factory()->count(3)->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
        ]);
        // Noise on an unrelated property
        MaintenanceRequest::factory()->create([
            'property_id' => $otherProperty->id,
            'requester_id' => User::factory()->create()->id,
        ]);

        Sanctum::actingAs($owner);

        $this->getJson("/api/properties/{$property->id}/maintenance-requests")
            ->assertOk()
            ->assertJsonPath('meta.total', 3);
    }

    public function test_unrelated_user_cannot_view_property_history(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
        ]);

        Sanctum::actingAs(User::factory()->create());

        $this->getJson("/api/properties/{$property->id}/maintenance-requests")
            ->assertForbidden();
    }

    public function test_history_can_be_filtered_by_status(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
            'status' => MaintenanceStatus::Open,
        ]);
        MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
            'status' => MaintenanceStatus::Completed,
        ]);

        Sanctum::actingAs($owner);

        $this->getJson("/api/properties/{$property->id}/maintenance-requests?filter[status]=".MaintenanceStatus::Completed->value)
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    public function test_history_can_be_filtered_by_priority(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
            'priority' => 'high',
        ]);
        MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
            'priority' => 'low',
        ]);

        Sanctum::actingAs($owner);

        $this->getJson("/api/properties/{$property->id}/maintenance-requests?filter[priority]=high")
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }
}

<?php

namespace Tests\Feature\Api;

use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MaintenanceAssignmentTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_assign_provider(): void
    {
        $owner = User::factory()->create();
        $provider = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
        ]);

        Sanctum::actingAs($owner);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'assigned_to' => $provider->id,
        ])->assertOk()
            ->assertJsonPath('data.assigned_to', $provider->id);
    }

    public function test_unrelated_user_cannot_assign_provider(): void
    {
        $owner = User::factory()->create();
        $provider = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
        ]);

        Sanctum::actingAs(User::factory()->create());

        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'assigned_to' => $provider->id,
        ])->assertForbidden();
    }

    public function test_assigned_provider_can_update_request_after_assignment(): void
    {
        $owner = User::factory()->create();
        $provider = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
            'assigned_to' => $provider->id,
        ]);

        Sanctum::actingAs($provider);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'scheduled_at' => now()->addDays(2)->toISOString(),
        ])->assertOk();
    }
}

<?php

namespace Tests\Feature\Api;

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

    public function test_owner_can_update_status(): void
    {
        $user = User::factory()->create();
        $mr = MaintenanceRequest::factory()->create(['requester_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'status' => 'in_progress',
            'estimated_cost' => 50000,
        ])->assertOk()
            ->assertJsonPath('data.status', 'in_progress')
            ->assertJsonPath('data.estimated_cost', 50000);
    }
}

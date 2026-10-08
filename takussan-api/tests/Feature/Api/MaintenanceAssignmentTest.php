<?php

namespace Tests\Feature\Api;

use App\Models\MaintenanceRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 — le prestataire est un prestataire : profil actif, collaboration active avec l'agence du
 * bien. Ces tests assignaient un `User::factory()` nu sur un bien sans agence, état que l'API refuse
 * désormais (`MaintenanceAssignableProviderTest`).
 */
class MaintenanceAssignmentTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    public function test_owner_can_assign_provider(): void
    {
        ['mr' => $mr, 'landlord' => $owner, 'agency' => $agency] = $this->maintenanceScenario(attributes: ['assigned_to' => null]);
        $provider = $this->providerFor($agency);

        Sanctum::actingAs($owner);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'assigned_to' => $provider->id,
        ])->assertOk()
            ->assertJsonPath('data.assigned_to', $provider->id);
    }

    public function test_unrelated_user_cannot_assign_provider(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario(attributes: ['assigned_to' => null]);
        $provider = $this->providerFor($agency);

        Sanctum::actingAs(User::factory()->create());

        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'assigned_to' => $provider->id,
        ])->assertForbidden();

        $this->assertNull(MaintenanceRequest::query()->find($mr->id)->assigned_to);
    }

    /** Le prestataire qui a ACCEPTÉ planifie son passage. */
    public function test_assigned_provider_can_update_request_after_assignment(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(attributes: ['accepted_at' => now()]);

        Sanctum::actingAs($provider);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'scheduled_at' => now()->addDays(2)->toISOString(),
        ])->assertOk();
    }
}

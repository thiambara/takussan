<?php

namespace Tests\Feature\Maintenance;

use App\Models\Agency;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 — AC3 : `assigned_to` ne reçoit qu'un compte assignable au bien.
 *
 * Il n'était validé que par `exists:users,id` : n'importe quel compte recevait la demande, et avec
 * elle le bien, le quartier et l'e-mail du demandeur. Le témoin (`active` + profil `active` → 200)
 * garde la règle d'un refus universel.
 */
class MaintenanceAssignableProviderTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    public function test_account_without_collaboration_is_refused_on_update(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'provider' => $current] = $this->maintenanceScenario();

        Sanctum::actingAs($landlord);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => User::factory()->create()->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('assigned_to');

        $this->assertSame($current->id, $mr->refresh()->assigned_to);
    }

    public function test_provider_of_another_agency_is_refused(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario();
        $elsewhere = $this->providerFor(Agency::factory()->create());

        Sanctum::actingAs($landlord);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $elsewhere->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('assigned_to');
    }

    public function test_ended_collaboration_is_refused(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'agency' => $agency] = $this->maintenanceScenario();
        $ended = $this->providerFor($agency, CollaborationStatus::Ended);

        Sanctum::actingAs($landlord);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $ended->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('assigned_to');
    }

    public function test_suspended_profile_is_refused(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'agency' => $agency] = $this->maintenanceScenario();
        $suspended = $this->providerFor($agency, profile: ServiceProviderProfileStatus::Suspended);

        Sanctum::actingAs($landlord);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $suspended->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('assigned_to');
    }

    /** Témoin — collaboration `active`, profil `active`. */
    public function test_active_provider_is_assigned(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'agency' => $agency] = $this->maintenanceScenario();
        $other = $this->providerFor($agency);

        Sanctum::actingAs($landlord);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $other->id])
            ->assertOk()
            ->assertJsonPath('data.assigned_to', $other->id);
    }

    /** Option retenue par défaut : un membre de l'équipe de l'agence est assignable. */
    public function test_team_member_is_assignable(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'agency' => $agency] = $this->maintenanceScenario();
        $agent = $this->agentOf($agency);

        Sanctum::actingAs($landlord);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $agent->id])
            ->assertOk();
    }

    public function test_store_refuses_an_unassignable_account(): void
    {
        ['property' => $property, 'landlord' => $landlord] = $this->maintenanceScenario();

        Sanctum::actingAs($landlord);

        $this->postJson('/api/maintenance-requests', $this->body($property->id, User::factory()->create()->id))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('assigned_to');
    }

    public function test_store_accepts_an_active_provider(): void
    {
        ['property' => $property, 'landlord' => $landlord, 'agency' => $agency] = $this->maintenanceScenario();
        $provider = $this->providerFor($agency);

        Sanctum::actingAs($landlord);

        $this->postJson('/api/maintenance-requests', $this->body($property->id, $provider->id))
            ->assertCreated()
            ->assertJsonPath('data.assigned_to', $provider->id);
    }

    /** @return array<string, mixed> */
    private function body(int $propertyId, int $assignee): array
    {
        return [
            'property_id' => $propertyId,
            'assigned_to' => $assignee,
            'title' => 'Fuite sous évier',
            'description' => 'Goutte à goutte continu',
            'category' => 'plumbing',
        ];
    }
}

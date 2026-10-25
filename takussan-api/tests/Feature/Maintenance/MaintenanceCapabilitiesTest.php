<?php

namespace Tests\Feature\Maintenance;

use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 — AC17 : `maintenance.assign` et `maintenance.close` ont enfin un lecteur.
 *
 * Elles étaient accordées à l'agent et au prestataire et lues par AUCUNE policy : retirer l'une à un
 * rôle personnalisé n'y changeait rien. Chaque refus a son témoin « avec » — sans lui, une policy qui
 * refuserait tout agent rendrait ce fichier vert.
 */
class MaintenanceCapabilitiesTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    public function test_agent_without_assign_cannot_assign(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario();
        $other = $this->providerFor($agency);

        Sanctum::actingAs($this->agentWithCapabilities($agency, [Capability::MaintenanceClose]));

        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $other->id])
            ->assertForbidden();
    }

    public function test_agent_with_assign_assigns(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario();
        $other = $this->providerFor($agency);

        Sanctum::actingAs($this->agentWithCapabilities($agency, [Capability::MaintenanceAssign]));

        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $other->id])
            ->assertOk()
            ->assertJsonPath('data.assigned_to', $other->id);
    }

    /**
     * TCK-2203 (P227.02) — la création assignait sur le seul `isPrincipalFor`, sans `maintenance.assign`
     * que la modification exige. Le témoin « avec » assigne : sans lui, un refus de toute création
     * assignée rendrait ce test vert.
     */
    public function test_agent_without_assign_cannot_assign_at_creation(): void
    {
        ['property' => $property, 'agency' => $agency] = $this->maintenanceScenario();
        $other = $this->providerFor($agency);
        $payload = [
            'property_id' => $property->id,
            'assigned_to' => $other->id,
            'title' => 'Fuite sous l\'évier',
            'description' => 'Une fuite sous l\'évier de la cuisine.',
            'category' => 'plumbing',
        ];

        Sanctum::actingAs($this->agentWithCapabilities($agency, [Capability::MaintenanceClose]));
        $this->postJson('/api/maintenance-requests', $payload)->assertForbidden();
        $this->assertSame(0, MaintenanceRequest::query()->where('assigned_to', $other->id)->count());

        Sanctum::actingAs($this->agentWithCapabilities($agency, [Capability::MaintenanceAssign]));
        $this->postJson('/api/maintenance-requests', $payload)
            ->assertCreated()
            ->assertJsonPath('data.assigned_to', $other->id);
    }

    /** TCK-2203 (P227.02) — sans `assigned_to`, l'agent sans la capacité crée toujours. */
    public function test_agent_without_assign_still_creates_unassigned(): void
    {
        ['property' => $property, 'agency' => $agency] = $this->maintenanceScenario();

        Sanctum::actingAs($this->agentWithCapabilities($agency, [Capability::MaintenanceClose]));
        $this->postJson('/api/maintenance-requests', [
            'property_id' => $property->id,
            'title' => 'Fuite sous l\'évier',
            'description' => 'Une fuite sous l\'évier de la cuisine.',
            'category' => 'plumbing',
        ])->assertCreated()->assertJsonPath('data.assigned_to', null);
    }

    public function test_agent_without_close_cannot_close(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::Completed);

        Sanctum::actingAs($this->agentWithCapabilities($agency, [Capability::MaintenanceAssign]));

        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'closed'])
            ->assertForbidden();

        $this->assertSame(MaintenanceStatus::Completed, $mr->refresh()->status);
    }

    public function test_agent_with_close_closes(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::Completed);

        Sanctum::actingAs($this->agentWithCapabilities($agency, [Capability::MaintenanceClose]));

        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'closed'])
            ->assertOk()
            ->assertJsonPath('data.status', 'closed');
    }

    /**
     * @param  array<int,Capability>  $capabilities
     */
    /** verif-592, mineur 9 (sonde v16) — décider d'un devis lit `maintenance.assign`. */
    public function test_agent_without_any_maintenance_capability_cannot_decide_a_quote(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted, ['quote_amount' => 1000, 'quote_submitted_at' => now()]);

        Sanctum::actingAs($this->agentWithCapabilities($agency, []));
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertForbidden();
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/reject", ['reason' => 'Trop cher pour ce bien'])->assertForbidden();
        $this->assertSame(MaintenanceStatus::QuoteSubmitted, $mr->refresh()->status);

        Sanctum::actingAs($this->agentWithCapabilities($agency, [Capability::MaintenanceAssign]));
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertOk();
        $this->assertSame(MaintenanceStatus::Approved, $mr->refresh()->status);
    }

    private function agentWithCapabilities($agency, array $capabilities): User
    {
        $role = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::Agent)
            ->withCapabilities($capabilities)
            ->create(['agency_id' => $agency->id]);

        $user = User::factory()->create();
        AgentProfile::query()->create([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
            'agency_role_id' => $role->id,
        ]);

        return $user;
    }
}

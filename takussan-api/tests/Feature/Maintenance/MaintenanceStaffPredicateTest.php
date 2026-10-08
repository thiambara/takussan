<?php

namespace Tests\Feature\Maintenance;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\Capability;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Services\Maintenance\MaintenanceParticipants;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 après TCK-587 — « l'équipe de l'agence » est le prédicat du personnel
 * (`MembershipCapabilityResolver::isStaffAt()` / `staffAgencyId()`), et lui seul.
 *
 * Le prédicat provisoire de 592 lisait `isAgentAt || isAgencyAdminAt` : un agent SUSPENDU restait
 * équipe (assignable, assigné, donneur d'ordre), et une délégation active du rôle agent ne
 * comptait pas. Chaque test ci-dessous rougit si l'un des sites revient à l'ancien prédicat.
 */
class MaintenanceStaffPredicateTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    private function suspendedAgentOf($agency): User
    {
        $user = User::factory()->create();
        AgentProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
            'status' => AgentProfileStatus::Suspended,
        ]);

        return $user;
    }

    private function delegatedLandlordOf($agency): User
    {
        $user = $this->landlordOf($agency);
        // Une délégation ne confère que ce que son délégant détient lui-même (TCK-395) : un agent
        // actif de l'agence.
        RoleDelegation::factory()->forRole('agent')->create([
            'user_id' => $user->id,
            'delegator_id' => $this->agentOf($agency)->id,
            'agency_id' => $agency->id,
        ]);

        return $user;
    }

    public function test_a_suspended_agent_is_not_assignable(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario();
        $suspended = $this->suspendedAgentOf($agency);

        Sanctum::actingAs($this->agentOf($agency));

        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $suspended->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('assigned_to');
    }

    public function test_a_suspended_agent_loses_the_intervention_assigned_to_him(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario();
        $suspended = $this->suspendedAgentOf($agency);
        $mr->forceFill(['assigned_to' => $suspended->id])->save();

        Sanctum::actingAs($suspended);

        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertForbidden();
        $this->assertNotContains($mr->id, collect($this->getJson('/api/maintenance-requests')->assertOk()->json('data'))->pluck('id')->all());
    }

    public function test_a_suspended_agent_is_not_a_principal(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted, ['quote_amount' => 10000]);
        $suspended = $this->suspendedAgentOf($agency);

        $this->assertNotContains($suspended->id, app(MaintenanceParticipants::class)->principals($mr)->pluck('id')->all());

        Sanctum::actingAs($suspended);

        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertForbidden();
        $this->assertSame(MaintenanceStatus::QuoteSubmitted, $mr->refresh()->status);
    }

    public function test_an_active_agent_delegation_makes_a_landlord_part_of_the_team(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted, ['quote_amount' => 10000]);
        $delegate = $this->delegatedLandlordOf($agency);

        $this->assertContains($delegate->id, app(MaintenanceParticipants::class)->principals($mr)->pluck('id')->all());

        Sanctum::actingAs($delegate);

        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk();
        $this->assertContains($mr->id, collect($this->getJson('/api/maintenance-requests')->assertOk()->json('data'))->pluck('id')->all());
        $this->getJson('/api/maintenance-requests')->assertJsonPath('meta.abilities.can_create', true);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertOk();
    }

    public function test_a_delegate_is_assignable_and_keeps_the_assigned_intervention(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario();
        $delegate = $this->delegatedLandlordOf($agency);
        $other = MaintenanceRequest::factory()->create([
            'property_id' => $mr->property_id,
            'requester_id' => $mr->requester_id,
            'status' => MaintenanceStatus::Open,
        ]);

        Sanctum::actingAs($this->agentOf($agency));
        $this->patchJson("/api/maintenance-requests/{$other->id}", ['assigned_to' => $delegate->id])->assertOk();

        $this->assertSame($delegate->id, $other->refresh()->assigned_to);
    }

    public function test_a_delegate_lists_the_intervention_assigned_to_him_in_another_agency(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario();
        // Son profil actif est un bailleur d'une AUTRE agence : seule la branche « assigné » le voit.
        $delegate = $this->landlordOf(Agency::factory()->create());
        RoleDelegation::factory()->forRole('agent')->create([
            'user_id' => $delegate->id,
            'delegator_id' => $this->agentOf($agency)->id,
            'agency_id' => $agency->id,
        ]);
        $mr->forceFill(['assigned_to' => $delegate->id])->save();

        Sanctum::actingAs($delegate);

        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk();
        $this->assertContains($mr->id, collect($this->getJson('/api/maintenance-requests')->assertOk()->json('data'))->pluck('id')->all());
    }

    public function test_a_suspended_agent_is_not_notified_even_when_another_profile_grants_assign(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted, ['quote_amount' => 10000]);
        $suspended = $this->suspendedAgentOf($agency);
        // Un rôle de bailleur personnalisé qui porte `maintenance.assign` : la capacité est là, le
        // personnel non — et la policy (`isPrincipalFor`) exige les deux.
        $role = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::Owner)
            ->withCapabilities([Capability::MaintenanceAssign])
            ->create(['agency_id' => $agency->id]);
        OwnerProfile::query()->create(['user_id' => $suspended->id, 'agency_id' => $agency->id, 'agency_role_id' => $role->id]);

        $this->assertTrue($suspended->fresh()->canActAt(Capability::MaintenanceAssign, $agency));
        $this->assertNotContains($suspended->id, app(MaintenanceParticipants::class)->principals($mr)->pluck('id')->all());
    }
}

<?php

namespace Tests\Feature\Api\Me;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Services\Membership\SystemRoleCapabilities;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-2942 — l'assistant de l'agent montre aussi ce que son rôle ne lui permet pas :
 * `GET /api/me/agent-profiles/{id}/role-capabilities` rend `granted` et `denied`, tirés du même
 * catalogue (`Capability::agencyAssignable()`) et du même rôle.
 */
class AgentRoleCapabilitiesDeniedTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @param  list<Capability>  $capabilities
     * @return array{User, AgentProfile}
     */
    private function agentAvecRole(array $capabilities): array
    {
        $agency = Agency::factory()->create();
        $role = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::Agent)
            ->withCapabilities($capabilities)
            ->create(['agency_id' => $agency->id, 'is_system' => false]);

        $user = User::factory()->create();
        $profile = AgentProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
            'agency_role_id' => $role->id,
            'status' => AgentProfileStatus::Draft,
        ]);

        return [$user, $profile];
    }

    private function lire(User $user, AgentProfile $profile): array
    {
        $this->actingAs($user, 'sanctum');

        return $this->getJson("/api/me/agent-profiles/{$profile->id}/role-capabilities")
            ->assertOk()
            ->json('data');
    }

    public function test_ac3_un_agent_se_voit_refuser_une_capacite_de_l_admin_jamais_une_des_siennes(): void
    {
        $capacitesAgent = app(SystemRoleCapabilities::class)->for(AgencyRoleBaseType::Agent);
        [$user, $profile] = $this->agentAvecRole($capacitesAgent);

        $data = $this->lire($user, $profile);

        $this->assertContains(Capability::PayoutsApprove->value, $data['denied']);
        $this->assertContains(Capability::TeamAssignRole->value, $data['denied']);
        $this->assertSame([], array_values(array_intersect($data['granted'], $data['denied'])));
        $this->assertEqualsCanonicalizing($data['capabilities'], $data['granted']);

        $catalogue = array_map(fn (Capability $c): string => $c->value, Capability::agencyAssignable());
        $this->assertEqualsCanonicalizing($catalogue, [...$data['granted'], ...$data['denied']]);
    }

    public function test_une_capacite_reservee_a_la_plateforme_n_est_ni_accordee_ni_refusee(): void
    {
        [$user, $profile] = $this->agentAvecRole([Capability::PropertiesCreate]);

        $data = $this->lire($user, $profile);

        foreach (Capability::platformReserved() as $reservee) {
            $this->assertNotContains($reservee->value, $data['denied']);
        }
        $this->assertSame([Capability::PropertiesCreate->value], $data['granted']);
    }
}

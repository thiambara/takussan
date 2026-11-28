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
 * TCK-589 AC13 (côté API) — le récap de l'onboarding agent montre ce que le RÔLE de
 * l'invitation accordera. Pendant l'assistant, le profil est `draft` : depuis TCK-587
 * (ADR-0031 §3) il ne confère rien, et `GET /api/me/capabilities` rend une liste vide —
 * à raison. Le récap lit donc `GET /api/me/agent-profiles/{id}/role-capabilities`.
 */
class AgentRoleCapabilitiesTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private AgentProfile $profile;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $role = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::Agent)
            ->withCapabilities([Capability::PropertiesCreate, Capability::CrmViewAll])
            ->create(['agency_id' => $this->agency->id, 'is_system' => false]);

        $this->agent = User::factory()->create();
        $this->profile = AgentProfile::factory()->create([
            'user_id' => $this->agent->id,
            'agency_id' => $this->agency->id,
            'agency_role_id' => $role->id,
            'status' => AgentProfileStatus::Draft,
        ]);
    }

    public function test_un_agent_draft_lit_exactement_les_capacites_de_son_role_personnalise(): void
    {
        $this->actingAs($this->agent, 'sanctum');

        $caps = $this->getJson("/api/me/agent-profiles/{$this->profile->id}/role-capabilities")
            ->assertOk()
            ->assertJsonPath('data.agency_id', $this->agency->id)
            ->json('data.capabilities');

        sort($caps);
        $this->assertSame([Capability::CrmViewAll->value, Capability::PropertiesCreate->value], $caps);
    }

    public function test_la_promesse_du_role_ne_confere_rien_tant_que_le_profil_est_draft(): void
    {
        $this->actingAs($this->agent, 'sanctum');

        $this->getJson("/api/me/capabilities?agency_id={$this->agency->id}")
            ->assertOk()
            ->assertJsonPath('data.capabilities', []);
    }

    public function test_le_profil_d_un_autre_compte_est_refuse(): void
    {
        $this->actingAs(User::factory()->create(), 'sanctum');

        $this->getJson("/api/me/agent-profiles/{$this->profile->id}/role-capabilities")->assertForbidden();
    }

    // TCK-2942 (ex-AgentRoleCapabilitiesDeniedTest, TCK-3017) — la même route rend aussi ce que le rôle refuse : granted et denied tirés du même catalogue.

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

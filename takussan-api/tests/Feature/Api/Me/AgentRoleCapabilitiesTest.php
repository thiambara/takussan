<?php

namespace Tests\Feature\Api\Me;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
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
}

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
 * TCK-589 AC13 (côté API) — le récap de l'onboarding agent lit
 * `GET /api/me/capabilities?agency_id=` de l'agence de l'invitation, AVANT que
 * l'agent ait terminé : son profil est encore `draft` (`AgentInvitationService`).
 * La réponse doit déjà être celle de son rôle personnalisé, ni plus ni moins —
 * sinon le récap du front, éprouvé par vitest sur une réponse simulée, mentirait
 * sur le vrai serveur.
 */
class DraftAgentCapabilitiesTest extends TestCase
{
    use RefreshDatabase;

    public function test_un_agent_draft_recoit_exactement_les_capacites_de_son_role_personnalise(): void
    {
        $agency = Agency::factory()->create();
        $role = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::Agent)
            ->withCapabilities([Capability::PropertiesCreate, Capability::CrmViewAll])
            ->create(['agency_id' => $agency->id, 'is_system' => false]);

        $agent = User::factory()->create();
        AgentProfile::factory()->create([
            'user_id' => $agent->id,
            'agency_id' => $agency->id,
            'agency_role_id' => $role->id,
            'status' => AgentProfileStatus::Draft,
        ]);

        $this->actingAs($agent, 'sanctum');

        $caps = $this->getJson("/api/me/capabilities?agency_id={$agency->id}")
            ->assertOk()
            ->assertJsonPath('data.agency_id', $agency->id)
            ->json('data.capabilities');

        sort($caps);
        $this->assertSame([Capability::CrmViewAll->value, Capability::PropertiesCreate->value], $caps);
    }
}

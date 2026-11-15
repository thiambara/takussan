<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-2670 (d1) — `GET /api/users?filter[assignable]=1` : la liste de l'équipe réduite au
 * personnel en exercice, la règle de `filter[assignable]` des membres d'une agence
 * (`User::buildAgencyMembersQuery`) — profil d'agent ou d'admin ACTIF dans l'agence, ou délégation
 * active de l'un de ces rôles, compte ni bloqué ni supprimé. C'est la population à qui l'agence
 * exige la double authentification (`TwoFactorRequirement` : « jamais un bailleur ») : la fiche de
 * l'agence en compte les membres qui ne l'ont pas activée. Sans le filtre, la liste comptait les
 * bailleurs et les agents suspendus.
 */
class UserAdminAssignableFilterTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_le_filtre_ne_garde_que_le_personnel_en_exercice(): void
    {
        $agency = Agency::factory()->create();
        $autre = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $agent = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agency->id]);
        $bailleur = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $agency->id]);
        $suspendu = User::factory()->create();
        AgentProfile::factory()->suspended()->create(['user_id' => $suspendu->id, 'agency_id' => $agency->id]);
        $bloque = User::factory()->create(['status' => UserStatus::Blocked->value]);
        AgentProfile::factory()->create(['user_id' => $bloque->id, 'agency_id' => $agency->id]);
        // Bailleur ici, agent ailleurs : il n'est pas du personnel de CETTE agence.
        $agentAilleurs = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $agentAilleurs->id, 'agency_id' => $agency->id]);
        AgentProfile::factory()->create(['user_id' => $agentAilleurs->id, 'agency_id' => $autre->id]);

        $tous = collect($this->apiGet('/api/users?per_page=100&fields[users]=id')->assertOk()->json('data'))->pluck('id');
        $this->assertTrue($tous->contains($bailleur->id), 'sans le filtre, la liste garde les bailleurs');

        $reponse = $this->apiGet('/api/users?per_page=100&fields[users]=id&filter[assignable]=1')->assertOk();

        $this->assertEqualsCanonicalizing([$admin->id, $agent->id], collect($reponse->json('data'))->pluck('id')->all());
        $this->assertSame(2, $reponse->json('meta.total'));
        // `two_factor_enabled` reste calculé sous un sparse fieldset réduit à l'id.
        $deuxFacteurs = collect($reponse->json('data'))->pluck('two_factor_enabled', 'id');
        $this->assertFalse($deuxFacteurs[$agent->id]);
        $this->assertIsBool($deuxFacteurs[$admin->id]);
    }

    public function test_un_filtre_faux_ne_restreint_rien(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $bailleur = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $agency->id]);

        $ids = collect($this->apiGet('/api/users?per_page=100&filter[assignable]=0')->assertOk()->json('data'))->pluck('id');

        $this->assertTrue($ids->contains($bailleur->id));
    }
}

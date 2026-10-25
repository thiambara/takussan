<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-2004 (P176.04 ; ADR-0005, amendement du 2026-10-23, point 4) — dans la liste des membres
 * d'une agence et dans la réponse de `PUT /users/{user}/role` (`POST members`, qui en rendait une
 * aussi, est retirée : TCK-2365), `roles`
 * se rapporte à l'agence de la route (ou à celle où le rôle est posé) : l'admin de A n'y apprend pas
 * ce qu'un membre tient dans B. Un membre suspendu y garde son type, et son statut sort à côté
 * (`role_statuses`).
 *
 * Avant : `UserResource` et `UserRoleController` rendaient `profileTypes()`, toutes agences.
 */
class AgencyMembersRolesDansLAgenceTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_la_liste_de_a_ne_dit_pas_le_role_tenu_dans_b(): void
    {
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $a]);
        $membre = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $membre->id, 'agency_id' => $a->id]);
        AgencyAdminProfile::factory()->create(['user_id' => $membre->id, 'agency_id' => $b->id]);
        OwnerProfile::factory()->create(['user_id' => $membre->id, 'agency_id' => $b->id]);

        $ligne = $this->ligneDe($a, $membre);

        $this->assertSame(['agent', 'customer'], $ligne['roles']);
        $this->assertSame(['agent' => 'active'], $ligne['role_statuses']);
    }

    public function test_un_membre_suspendu_garde_son_type_avec_son_statut(): void
    {
        $a = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $a]);
        $membre = User::factory()->create();
        AgentProfile::factory()->suspended()->create(['user_id' => $membre->id, 'agency_id' => $a->id]);

        $ligne = $this->ligneDe($a, $membre);

        $this->assertSame(['agent', 'customer'], $ligne['roles']);
        $this->assertSame(['agent' => 'suspended'], $ligne['role_statuses']);
    }

    public function test_la_reponse_du_changement_de_role_se_rapporte_a_l_agence_du_role(): void
    {
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $a]);
        $cible = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $cible->id, 'agency_id' => $a->id]);
        AgencyAdminProfile::factory()->create(['user_id' => $cible->id, 'agency_id' => $b->id]);

        $reponse = $this->apiPut("/api/users/{$cible->id}/role", ['role' => 'owner'])->assertOk();

        $this->assertSame(['owner', 'customer'], $reponse->json('data.roles'));
    }

    /** @return array<string, mixed> */
    private function ligneDe(Agency $agency, User $membre): array
    {
        $lignes = collect($this->getJson("/api/agencies/{$agency->id}/members?per_page=100")->assertOk()->json('data'))
            ->keyBy('id');
        $this->assertTrue($lignes->has($membre->id), 'Le membre manque à la liste.');

        return $lignes[$membre->id];
    }
}

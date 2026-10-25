<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-1770 (P136.04) — la liste des membres (`GET /api/users`) rend, sur demande
 * (`with_role_assignments=1`), les affectations de rôle de SES lignes, bornées à la page, jugées
 * par la règle de `GET /api/agencies/{agency}/role-assignments` (`AgencyRolePolicy::viewAny`).
 *
 * Avant : l'écran Équipe attendait la liste pour demander ces affectations par un second appel.
 */
class UserAdminRoleAssignmentsTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create(['kind' => AgencyKind::Standard, 'primary_admin_id' => null]);
        $this->admin = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $this->admin->id, 'agency_id' => $this->agency->id]);
    }

    private function agent(): array
    {
        $user = User::factory()->create();
        $profil = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $this->agency->id]);

        return [$user, $profil];
    }

    public function test_les_affectations_de_la_page_viennent_avec_la_liste_sous_la_forme_de_role_assignments(): void
    {
        [$agent, $profil] = $this->agent();

        $liste = $this->actingAs($this->admin)
            ->getJson('/api/users?with_role_assignments=1&per_page=50')
            ->assertOk();

        $attendu = $this->actingAs($this->admin)
            ->getJson("/api/agencies/{$this->agency->id}/role-assignments?user_ids=".implode(',', collect($liste->json('data'))->pluck('id')->all()))
            ->assertOk()
            ->json('data');

        $rendu = $liste->json('meta.role_assignments');
        $this->assertIsArray($rendu);
        $this->assertEqualsCanonicalizing($attendu, $rendu);
        $this->assertContains([
            'profile_id' => $profil->id,
            'profile_type' => AgencyRoleBaseType::Agent->value,
            'user_id' => $agent->id,
            'agency_role_id' => (int) $profil->fresh()->agency_role_id,
            'agency_role_name' => AgencyRoleBaseType::Agent->defaultRoleName(),
            // TCK-2364 (P241.02) — la ligne d'un agent porte son taux, que la fiche de membre écrit.
            'commission_rate' => (float) $profil->fresh()->commission_rate,
        ], $rendu);
    }

    public function test_les_affectations_sont_bornees_aux_lignes_de_la_page(): void
    {
        $this->agent();
        $this->agent();

        $reponse = $this->actingAs($this->admin)
            ->getJson('/api/users?with_role_assignments=1&per_page=1&sort=id')
            ->assertOk();

        $page = collect($reponse->json('data'))->pluck('id')->all();
        $this->assertCount(1, $page);
        $this->assertNotEmpty($reponse->json('meta.role_assignments'));
        foreach ($reponse->json('meta.role_assignments') as $ligne) {
            $this->assertContains($ligne['user_id'], $page);
        }
    }

    public function test_sans_la_demande_la_liste_ne_les_rend_pas(): void
    {
        $this->agent();

        $this->actingAs($this->admin)->getJson('/api/users')
            ->assertOk()
            ->assertJsonMissingPath('meta.role_assignments');
    }

    public function test_un_lecteur_de_la_liste_sans_team_assign_role_ne_les_recoit_pas(): void
    {
        // Même règle que `role-assignments`, qui lui rend 403 : la liste reste lisible (team.invite).
        $lecteur = User::factory()->create(['agency_id' => $this->agency->id]);
        AgentProfile::query()->create(['user_id' => $lecteur->id, 'agency_id' => $this->agency->id]);
        $role = AgencyRole::factory()->ofType(AgencyRoleBaseType::Agent)
            ->withCapabilities([Capability::TeamInvite])
            ->create(['agency_id' => $this->agency->id]);
        foreach ([AgentProfile::class, OwnerProfile::class] as $classe) {
            $classe::query()->where('user_id', $lecteur->id)->where('agency_id', $this->agency->id)
                ->update(['agency_role_id' => $role->id]);
        }
        $lecteur = $lecteur->fresh();

        $this->actingAs($lecteur)
            ->getJson("/api/agencies/{$this->agency->id}/role-assignments?user_ids={$lecteur->id}")
            ->assertForbidden();

        $this->actingAs($lecteur)->getJson('/api/users?with_role_assignments=1')
            ->assertOk()
            ->assertJsonMissingPath('meta.role_assignments');
    }
}

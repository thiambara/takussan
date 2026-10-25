<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\Capability;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AgencyMembersListTest extends TestCase
{
    use RefreshDatabase;

    protected function createAdminWithAgency(): array
    {
        $agency = Agency::factory()->create();
        // TCK-589 (vérification adverse B1) — un profil plateforme porte la 2FA sur toute
        // action protégée, membres d'agence compris.
        $admin = User::factory()->withTwoFactor()->create(['agency_id' => $agency->id]);
        $this->materializeRoleProfile($admin, 'super_admin');
        $agency->update(['primary_admin_id' => $admin->id]);

        return [$admin, $agency];
    }

    public function test_admin_can_list_agency_members(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();
        User::factory()->count(3)->create(['agency_id' => $agency->id]);

        Sanctum::actingAs($admin);

        $this->getJson("/api/agencies/{$agency->id}/members")
            ->assertOk()
            ->assertJsonStructure(['data', 'meta' => ['total', 'current_page']])
            ->assertJsonPath('meta.total', 4); // 3 members + admin
    }

    public function test_member_listing_includes_users_with_only_agent_profile_and_only_owner_profile(): void
    {
        // PR #104 review regression — when `Agency::members` was a
        // `hasManyThrough(AgentProfile)` relation, any caller relying on it
        // silently lost OwnerProfile-only members. The endpoint authority
        // is the controller query (whereHas agentProfiles OR ownerProfiles)
        // — pin both halves.
        [$admin, $agency] = $this->createAdminWithAgency();

        $agentOnly = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $agentOnly->id, 'agency_id' => $agency->id]);

        $ownerOnly = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $ownerOnly->id, 'agency_id' => $agency->id]);

        Sanctum::actingAs($admin);

        $ids = collect($this->getJson("/api/agencies/{$agency->id}/members")
            ->assertOk()
            ->json('data'))
            ->pluck('id');

        $this->assertTrue($ids->contains($agentOnly->id), 'AgentProfile-only user must appear in members.');
        $this->assertTrue($ids->contains($ownerOnly->id), 'OwnerProfile-only user must appear in members.');
    }

    /**
     * P88.03 (TCK-1096) — `filter[role]` juge le rôle DANS l'agence de la route, sans filtre de
     * statut : l'onglet d'équipe garde l'agent suspendu, et ne présente plus comme agent un bailleur
     * qui ne l'est qu'ailleurs. `filter[assignable]=1`, que seuls les sélecteurs de cible envoient,
     * ne garde que le personnel joignable (`PersonnelDeLAgence::estPersonnel()`).
     */
    public function test_role_filter_is_bound_to_the_agency_and_assignable_keeps_reachable_staff(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();

        $actif = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $actif->id, 'agency_id' => $agency->id]);

        $bloque = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $bloque->id, 'agency_id' => $agency->id]);
        $bloque->forceFill(['status' => UserStatus::Blocked])->save();

        $suspendu = User::factory()->create();
        AgentProfile::factory()->create([
            'user_id' => $suspendu->id, 'agency_id' => $agency->id, 'status' => AgentProfileStatus::Suspended,
        ]);

        $bailleurAgentAilleurs = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $bailleurAgentAilleurs->id, 'agency_id' => $agency->id]);
        AgentProfile::factory()->create(['user_id' => $bailleurAgentAilleurs->id, 'agency_id' => Agency::factory()->create()->id]);

        Sanctum::actingAs($admin);
        $ids = fn (string $qs) => collect($this->getJson("/api/agencies/{$agency->id}/members?{$qs}&fields[users]=id,first_name&per_page=100")
            ->assertOk()
            ->json('data'))
            ->pluck('id');

        $assignables = $ids('filter[role]=agent&filter[assignable]=1');
        $this->assertTrue($assignables->contains($actif->id), "L'agent actif doit être proposé.");
        $this->assertFalse($assignables->contains($bloque->id), 'Un compte bloqué ne doit pas être proposé.');
        $this->assertFalse($assignables->contains($suspendu->id), 'Un agent suspendu ne doit pas être proposé.');
        $this->assertFalse($assignables->contains($bailleurAgentAilleurs->id), "Un bailleur agent ailleurs n'est pas agent ici.");

        $agents = $ids('filter[role]=agent');
        $this->assertTrue($agents->contains($actif->id));
        $this->assertTrue($agents->contains($suspendu->id), "L'onglet d'équipe garde l'agent suspendu.");
        $this->assertFalse($agents->contains($bailleurAgentAilleurs->id), "Un bailleur agent ailleurs n'est pas agent ici.");

        $this->assertTrue($ids('filter[role]=owner')->contains($bailleurAgentAilleurs->id));
    }

    /**
     * P120.02 (TCK-1244) — le passage à `agency_admin` supprime les profils d'agent et de bailleur :
     * le promu ne tient plus que son profil d'admin. Il reste un membre de l'agence (`/members`,
     * `filter[assignable]=1`, `filter[role]=agency_admin`, l'équipe de la console), et sort des
     * candidats à une délégation (`filter[role]=agent,owner`), que `RoleDelegationService::create`
     * lui refuse.
     */
    public function test_un_agent_promu_administrateur_reste_membre_sans_devenir_candidat_a_une_delegation(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();

        $promu = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $promu->id, 'agency_id' => $agency->id]);

        $bailleur = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $agency->id]);

        Sanctum::actingAs($admin);
        $this->putJson("/api/agencies/{$agency->id}/members/{$promu->id}/role", ['role' => 'agency_admin'])->assertOk();
        $this->assertFalse($promu->refresh()->agentProfiles()->where('agency_id', $agency->id)->exists());

        $ids = fn (string $qs) => collect($this->getJson("/api/agencies/{$agency->id}/members?{$qs}&fields[users]=id,first_name&per_page=100")
            ->assertOk()
            ->json('data'))
            ->pluck('id');

        $this->assertTrue($ids('')->contains($promu->id), "L'admin promu reste dans la liste des membres.");
        $this->assertTrue($ids('filter[assignable]=1')->contains($promu->id), "L'API l'accepte comme cible : il est proposé.");
        $this->assertTrue($ids('filter[role]=agency_admin')->contains($promu->id));
        $this->assertFalse($ids('filter[role]=agent')->contains($promu->id));

        $candidats = $ids('filter[role]=agent,owner');
        $this->assertFalse($candidats->contains($promu->id), "L'admin seul n'est pas candidat à une délégation.");
        $this->assertTrue($candidats->contains($bailleur->id), 'Un bailleur de l\'agence reste candidat.');

        $this->assertContains($promu->id, $this->getJson("/api/admin/agencies/{$agency->id}/team?per_page=100")
            ->assertOk()
            ->json('data.*.id'), "L'équipe de la console montre l'admin promu.");
    }

    /**
     * P120.05 — l'agent qui détient `crm.assign` attribue une demande de contact : il lit les cibles
     * de son agence (décision du porteur, 2026-10-22), bornées au personnel joignable, sans autre
     * colonne que le nom, quoi qu'il demande. Le reste de `/members` lui reste fermé.
     */
    public function test_un_agent_crm_assign_lit_les_seules_cibles_du_personnel(): void
    {
        [, $agency] = $this->createAdminWithAgency();

        $collegue = User::factory()->create(['first_name' => 'Zeyna']);
        AgentProfile::factory()->create(['user_id' => $collegue->id, 'agency_id' => $agency->id]);
        $bloque = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $bloque->id, 'agency_id' => $agency->id]);
        $bloque->forceFill(['status' => UserStatus::Blocked])->save();
        $bailleur = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $agency->id]);

        $agent = $this->actingAsRole('agent', ['agency' => $agency, 'first_name' => 'Awa'], 'sanctum');
        $this->assertTrue($agent->canActAt(Capability::CrmAssign, $agency));

        $lignes = $this->getJson("/api/agencies/{$agency->id}/members?sort=first_name&per_page=100&fields[users]=id,first_name,email,phone&include=ownerProfiles")
            ->assertOk()
            ->json('data');
        $ids = collect($lignes)->pluck('id');

        $this->assertTrue($ids->contains($collegue->id), 'Le collègue joignable est une cible.');
        $this->assertTrue($ids->contains($agent->id), "L'agent peut se l'attribuer, comme l'API l'accepte.");
        $this->assertFalse($ids->contains($bloque->id), 'Un compte bloqué n\'est pas une cible.');
        $this->assertFalse($ids->contains($bailleur->id), 'Un bailleur n\'est pas une cible.');
        $this->assertSame(['Awa', 'Zeyna'], collect($lignes)->pluck('first_name')->intersect(['Awa', 'Zeyna'])->values()->all(), 'Le tri demandé est appliqué.');
        foreach ($lignes as $ligne) {
            $this->assertSame(['id', 'first_name', 'last_name'], array_keys($ligne), 'Le nom seul, quoi que la requête demande.');
        }

        $this->getJson('/api/agencies/'.Agency::factory()->create()->id.'/members')->assertForbidden();
    }

    public function test_un_bailleur_ne_lit_pas_les_membres(): void
    {
        [, $agency] = $this->createAdminWithAgency();
        $this->actingAsRole('owner', ['agency' => $agency], 'sanctum');

        $this->getJson("/api/agencies/{$agency->id}/members")->assertForbidden();
    }

    public function test_non_admin_cannot_list_members(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();
        $outsider = User::factory()->create();

        Sanctum::actingAs($outsider);

        $this->getJson("/api/agencies/{$agency->id}/members")
            ->assertForbidden();
    }

    // TCK-2365 (P242.01) — les quatre cas de `POST /agencies/{id}/members` (par e-mail, e-mail
    // inconnu, comme admin, rôle invalide) sont partis avec la route : un compte existant entre par
    // l'invitation (`RattachementParInvitationTest`, `InviteAgentTest`).

    public function test_cannot_remove_last_agency_admin(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();

        // Create a second member who is the only agency_admin. The primary_admin
        // guard already blocks removing `admin`, so we use a separate user.
        $onlyAdmin = User::factory()->create(['agency_id' => $agency->id]);
        $this->materializeRoleProfile($onlyAdmin, 'agency_admin', $agency);

        Sanctum::actingAs($admin);

        $this->deleteJson("/api/agencies/{$agency->id}/members/{$onlyAdmin->id}")
            ->assertStatus(422);
    }

    public function test_cannot_demote_last_agency_admin_via_role_endpoint(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();

        // Sole agency_admin of the agency. Attempting to downgrade to `agent`
        // must fail — the DELETE path already guards this; the PATCH/PUT role
        // endpoint must apply the same invariant.
        $onlyAdmin = User::factory()->create(['agency_id' => $agency->id]);
        $this->materializeRoleProfile($onlyAdmin, 'agency_admin', $agency);

        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}/members/{$onlyAdmin->id}", [
            'role' => 'agent',
        ])->assertStatus(422);

        $this->putJson("/api/agencies/{$agency->id}/members/{$onlyAdmin->id}/role", [
            'role' => 'agent',
        ])->assertStatus(422);

        $this->assertTrue($onlyAdmin->refresh()->isAgencyAdminAt((int) $agency->id));
    }

    public function test_can_demote_agency_admin_when_other_admins_remain(): void
    {
        [$admin, $agency] = $this->createAdminWithAgency();

        $adminA = User::factory()->create(['agency_id' => $agency->id]);
        $this->materializeRoleProfile($adminA, 'agency_admin', $agency);
        $adminB = User::factory()->create(['agency_id' => $agency->id]);
        $this->materializeRoleProfile($adminB, 'agency_admin', $agency);

        Sanctum::actingAs($admin);

        // With two agency_admins, demoting one is allowed.
        $this->patchJson("/api/agencies/{$agency->id}/members/{$adminA->id}", [
            'role' => 'agent',
        ])->assertOk();
    }
}

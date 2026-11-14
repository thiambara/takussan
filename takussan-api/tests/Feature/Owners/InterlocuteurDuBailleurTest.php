<?php

namespace Tests\Feature\Owners;

use App\Models\Agency;
use App\Models\Enums\UserStatus;
use App\Models\Invitation;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Invitation\OwnerInvitationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2838 — `GET /api/me/owner-profiles/{owner_profile}/interlocuteur` : la personne qui, à l'agence, s'occupe du
 * bailleur invité, à l'écran 2 de son assistant.
 *
 * La règle : l'invitant de la dernière invitation qui désigne CE profil, dans CETTE agence, s'il y est encore membre
 * actif (agent ou administrateur, compte actif) ; sinon l'agence elle-même. Le numéro : le principal VÉRIFIÉ de
 * l'invitant, sinon le téléphone public de l'agence. Jamais le second numéro, l'e-mail ni l'identifiant de l'invitant.
 * Le titulaire du profil seul.
 */
class InterlocuteurDuBailleurTest extends TestCase
{
    use RefreshDatabase;

    private const TELEPHONE_AGENT = '+221771230001';

    private const SECOND_NUMERO = '+221771230099';

    private const TELEPHONE_AGENCE = '+221338200000';

    public function test_le_bailleur_invite_par_un_agent_actif_lit_son_nom_son_role_et_son_numero_verifie(): void
    {
        [$profil, $bailleur] = $this->invite();

        Sanctum::actingAs($bailleur);
        $this->getJson($this->url($profil))
            ->assertOk()
            ->assertExactJson(['data' => [
                'source' => 'inviter',
                'first_name' => 'Awa',
                'last_name' => 'Diop',
                'role' => 'agent',
                'phone' => self::TELEPHONE_AGENT,
                'whatsapp' => true,
            ]]);
    }

    public function test_un_administrateur_actif_de_l_agence_a_le_role_agency_admin(): void
    {
        $agence = Agency::factory()->create(['phone' => self::TELEPHONE_AGENCE]);
        $admin = $this->membre($agence, admin: true);
        [$profil, $bailleur] = $this->invite($agence, $admin);

        Sanctum::actingAs($bailleur);
        $this->getJson($this->url($profil))->assertOk()->assertJsonPath('data.role', 'agency_admin');
    }

    public function test_sparse_fieldsets_ne_rendent_que_les_champs_demandes(): void
    {
        [$profil, $bailleur] = $this->invite();

        Sanctum::actingAs($bailleur);
        $this->getJson($this->url($profil).'?fields[interlocuteur]=first_name,role,inconnu')
            ->assertOk()
            ->assertExactJson(['data' => ['source' => 'inviter', 'first_name' => 'Awa', 'role' => 'agent']]);
    }

    public function test_un_numero_non_verifie_de_l_agent_n_est_jamais_rendu_le_numero_de_l_agence_le_remplace(): void
    {
        [$profil, $bailleur, $agent] = $this->invite();
        $agent->forceFill(['phone_verified_at' => null])->save();

        Sanctum::actingAs($bailleur);
        $reponse = $this->getJson($this->url($profil))->assertOk();
        $reponse->assertJsonPath('data.first_name', 'Awa')
            ->assertJsonPath('data.phone', self::TELEPHONE_AGENCE)
            ->assertJsonPath('data.whatsapp', false);
        $this->assertStringNotContainsString(self::TELEPHONE_AGENT, $reponse->getContent());
    }

    public function test_un_agent_sans_fiche_publique_ne_fait_pas_sortir_son_numero_le_numero_de_l_agence_le_remplace(): void
    {
        [$profil, $bailleur, $agent] = $this->invite();
        // Ni `username` ni `public_slug` : aucune fiche publique, donc aucun numéro déjà publié (option a′).
        $agent->forceFill(['username' => null, 'public_slug' => null])->save();

        Sanctum::actingAs($bailleur);
        $reponse = $this->getJson($this->url($profil))->assertOk();
        $reponse->assertExactJson(['data' => [
            'source' => 'inviter',
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'role' => 'agent',
            'phone' => self::TELEPHONE_AGENCE,
            'whatsapp' => false,
        ]]);
        $this->assertStringNotContainsString(self::TELEPHONE_AGENT, $reponse->getContent());
    }

    public function test_un_agent_parti_ou_actif_ailleurs_ne_fait_sortir_ni_son_nom_ni_son_numero(): void
    {
        [$profil, $bailleur, $agent] = $this->invite();
        AgentProfile::query()->where('user_id', $agent->id)->update(['status' => 'inactive']);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => Agency::factory()->create()->id]);

        Sanctum::actingAs($bailleur);
        $corps = $this->getJson($this->url($profil))->assertOk()->assertExactJson(['data' => $this->agence()])->getContent();
        $this->assertStringNotContainsString('Diop', $corps);
        $this->assertStringNotContainsString(self::TELEPHONE_AGENT, $corps);
    }

    public function test_rien_d_autre_de_l_invitant_ne_sort(): void
    {
        [$profil, $bailleur, $agent] = $this->invite();

        Sanctum::actingAs($bailleur);
        $corps = $this->getJson($this->url($profil))->assertOk()->getContent();

        $this->assertStringNotContainsString($agent->email, $corps);
        $this->assertStringNotContainsString(self::SECOND_NUMERO, $corps);
        $this->assertStringNotContainsString('"id"', $corps);
    }

    public function test_l_invitant_qui_a_quitte_l_agence_laisse_place_a_l_agence(): void
    {
        [$profil, $bailleur, $agent] = $this->invite();
        AgentProfile::query()->where('user_id', $agent->id)->update(['status' => 'inactive']);

        Sanctum::actingAs($bailleur);
        $this->getJson($this->url($profil))->assertOk()->assertExactJson(['data' => $this->agence()]);
    }

    public function test_l_invitant_dont_le_compte_n_est_plus_actif_laisse_place_a_l_agence(): void
    {
        [$profil, $bailleur, $agent] = $this->invite();
        $agent->forceFill(['status' => UserStatus::Blocked])->save();

        Sanctum::actingAs($bailleur);
        $this->getJson($this->url($profil))->assertOk()->assertExactJson(['data' => $this->agence()]);
    }

    public function test_l_invitant_membre_d_une_autre_agence_seulement_laisse_place_a_l_agence(): void
    {
        $agence = Agency::factory()->create(['phone' => self::TELEPHONE_AGENCE]);
        $ailleurs = $this->membre(Agency::factory()->create());
        [$profil, $bailleur] = $this->invite($agence, $ailleurs);

        Sanctum::actingAs($bailleur);
        $this->getJson($this->url($profil))->assertOk()->assertExactJson(['data' => $this->agence()]);
    }

    public function test_une_invitation_d_une_autre_agence_ne_designe_pas_l_interlocuteur(): void
    {
        [$profil, $bailleur, , $invitation] = $this->invite();
        // L'invitation désigne bien ce profil, mais au nom d'une autre agence (où l'invitant est aussi membre).
        $autre = Agency::factory()->create();
        AgentProfile::factory()->create(['user_id' => $invitation->invited_by, 'agency_id' => $autre->id]);
        $invitation->forceFill(['agency_id' => $autre->id])->save();

        Sanctum::actingAs($bailleur);
        $this->getJson($this->url($profil))->assertOk()->assertExactJson(['data' => $this->agence()]);
    }

    public function test_l_invitation_d_un_autre_profil_ne_designe_pas_l_interlocuteur(): void
    {
        [$profil, $bailleur] = $this->invite();
        Invitation::query()->update(['invitable_id' => OwnerProfile::factory()->create(['agency_id' => $profil->agency_id])->id]);

        Sanctum::actingAs($bailleur);
        $this->getJson($this->url($profil))->assertOk()->assertExactJson(['data' => $this->agence()]);
    }

    public function test_l_invitation_d_un_profil_d_un_autre_type_au_meme_identifiant_ne_designe_pas_l_interlocuteur(): void
    {
        [$profil, $bailleur, , $invitation] = $this->invite();
        // Même agence, même `invitable_id`, mais la cible est un profil d'agent : ce n'est pas l'invitation du bailleur.
        $invitation->forceFill(['invitable_type' => (new AgentProfile)->getMorphClass()])->save();

        Sanctum::actingAs($bailleur);
        $this->getJson($this->url($profil))->assertOk()->assertExactJson(['data' => $this->agence()]);
    }

    public function test_l_invitation_ecrite_par_le_vrai_service_designe_l_invitant(): void
    {
        Mail::fake();
        Notification::fake();
        $agence = Agency::factory()->create(['phone' => self::TELEPHONE_AGENCE]);
        $admin = $this->membre($agence, admin: true);
        $invitation = app(OwnerInvitationService::class)->invite($agence, $admin, [
            'email' => 'bailleur-reel@example.com', 'first_name' => 'Moussa', 'last_name' => 'Ndiaye',
        ]);
        $bailleur = User::factory()->create();
        $profil = OwnerProfile::query()->findOrFail($invitation->invitable_id);
        $profil->forceFill(['user_id' => $bailleur->id])->save();

        Sanctum::actingAs($bailleur);
        $this->getJson($this->url($profil))->assertOk()
            ->assertJsonPath('data.source', 'inviter')
            ->assertJsonPath('data.role', 'agency_admin')
            ->assertJsonPath('data.last_name', 'Diop');
    }

    public function test_un_invitant_actif_sans_aucun_numero_public_reste_montre_sans_numero(): void
    {
        $agence = Agency::factory()->create(['phone' => null]);
        $admin = $this->membre($agence, admin: true, prenom: 'Mariama', nom: 'Faye');
        $admin->forceFill(['phone' => null, 'phone_verified_at' => null])->save();
        [$profil, $bailleur] = $this->invite($agence, $admin);

        Sanctum::actingAs($bailleur);
        $this->getJson($this->url($profil))->assertOk()->assertExactJson(['data' => [
            'source' => 'inviter',
            'first_name' => 'Mariama',
            'last_name' => 'Faye',
            'role' => 'agency_admin',
            'phone' => null,
            'whatsapp' => false,
        ]]);
    }

    public function test_sans_invitant_ni_numero_d_agence_l_agence_reste_montree_sans_numero(): void
    {
        $agence = Agency::factory()->create(['phone' => null]);
        $bailleur = User::factory()->create();
        $profil = OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $agence->id]);

        Sanctum::actingAs($bailleur);
        $this->getJson($this->url($profil))->assertOk()->assertExactJson(['data' => ['phone' => null] + $this->agence()]);
    }

    public function test_un_autre_bailleur_recoit_403_et_ne_voit_rien(): void
    {
        [$profil] = $this->invite();
        $intrus = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $intrus->id, 'agency_id' => $profil->agency_id]);

        Sanctum::actingAs($intrus);
        $reponse = $this->getJson($this->url($profil))->assertForbidden();
        $this->assertStringNotContainsString('Diop', $reponse->getContent());
        $this->assertStringNotContainsString(self::TELEPHONE_AGENT, $reponse->getContent());
    }

    public function test_un_agent_de_l_agence_du_profil_recoit_403(): void
    {
        [$profil] = $this->invite();
        $collegue = $this->membre(Agency::query()->findOrFail($profil->agency_id), telephone: '+221771230002');

        Sanctum::actingAs($collegue);
        $this->getJson($this->url($profil))->assertForbidden();
    }

    public function test_le_meme_bailleur_sur_deux_agences_ne_lit_sur_chaque_profil_que_l_interlocuteur_de_ce_profil(): void
    {
        [$profilA, $bailleur] = $this->invite();
        $agenceB = Agency::factory()->create(['phone' => '+221338200001']);
        $agentB = $this->membre($agenceB, prenom: 'Modou', nom: 'Fall', telephone: '+221771230003');
        [$profilB] = $this->invite($agenceB, $agentB, $bailleur);

        Sanctum::actingAs($bailleur);
        $a = $this->getJson($this->url($profilA))->assertOk();
        $a->assertJsonPath('data.last_name', 'Diop');
        $this->assertStringNotContainsString('Fall', $a->getContent());
        $b = $this->getJson($this->url($profilB))->assertOk();
        $b->assertJsonPath('data.last_name', 'Fall');
        $this->assertStringNotContainsString('Diop', $b->getContent());
    }

    public function test_un_invite_non_connecte_recoit_401(): void
    {
        [$profil] = $this->invite();

        $this->getJson($this->url($profil))->assertUnauthorized();
    }

    /** @return array<string, mixed> */
    private function agence(): array
    {
        return [
            'source' => 'agency',
            'first_name' => null,
            'last_name' => null,
            'role' => 'agency',
            'phone' => self::TELEPHONE_AGENCE,
            'whatsapp' => false,
        ];
    }

    private function membre(Agency $agence, bool $admin = false, string $prenom = 'Awa', string $nom = 'Diop', string $telephone = self::TELEPHONE_AGENT): User
    {
        $user = User::factory()->create([
            'first_name' => $prenom,
            'last_name' => $nom,
            'phone' => $telephone,
            'phone_verified_at' => now(),
            'phone_whatsapp' => true,
            'secondary_phone' => self::SECOND_NUMERO.substr($telephone, -1),
            'secondary_phone_verified_at' => now(),
        ]);
        $admin
            ? AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agence->id])
            : AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agence->id]);

        return $user;
    }

    /**
     * Le bailleur invité, l'invitation acceptée : l'état réel à l'écran 2 de l'assistant.
     *
     * @return array{0: OwnerProfile, 1: User, 2: User, 3: Invitation}
     */
    private function invite(?Agency $agence = null, ?User $invitant = null, ?User $bailleur = null): array
    {
        $agence ??= Agency::factory()->create(['phone' => self::TELEPHONE_AGENCE]);
        $invitant ??= $this->membre($agence);
        $bailleur ??= User::factory()->create();
        $profil = OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $agence->id]);
        $invitation = Invitation::factory()->accepted()->create([
            'email' => $bailleur->email,
            'invited_user_id' => $bailleur->id,
            'invited_by' => $invitant->id,
            'agency_id' => $agence->id,
            'role' => 'owner',
            'invitable_type' => $profil->getMorphClass(),
            'invitable_id' => $profil->id,
        ]);

        return [$profil, $bailleur, $invitant, $invitation];
    }

    private function url(OwnerProfile $profil): string
    {
        return "/api/me/owner-profiles/{$profil->id}/interlocuteur";
    }
}

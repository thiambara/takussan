<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * Vérification de TCK-2668 (D1) — l'agent qui a invité SON client à créer son compte relance et
 * annule cette invitation sans `team.invite`, et l'API le dit dans `abilities`.
 *
 * Mesuré sur 776dc214f : agent invite → 201, `resend` → 403, `revoke` → 403 ; la fiche client
 * offrait les deux gestes et l'agent n'en avait aucun qui marche. Les invitations d'équipe restent
 * sous `team.invite`.
 */
class RelanceParLEmetteurDuClientTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        config(['auth.phone_login.enabled' => false]);

        $this->agence = Agency::factory()->create();
        $this->agent = $this->agentWithout($this->agence, Capability::TeamInvite);
    }

    private function inviterSonClient(?User $par = null): Invitation
    {
        $par ??= $this->agent;
        $fiche = Customer::factory()->create([
            'agency_id' => $this->agence->id,
            'added_by_id' => $par->id,
            'user_id' => null,
            'email' => 'client'.Customer::query()->count().'@example.test',
        ]);
        $id = $this->actingAsApi($par)->postJson("/api/customers/{$fiche->id}/invite")->assertCreated()->json('data.id');

        return Invitation::query()->findOrFail($id);
    }

    public function test_l_emetteur_sans_team_invite_relance_et_annule_l_invitation_de_son_client(): void
    {
        $this->assertFalse($this->agent->canActAt(Capability::TeamInvite, $this->agence));
        $invitation = $this->inviterSonClient();

        $this->actingAsApi($this->agent)->postJson("/api/invitations/{$invitation->id}/resend")->assertOk();
        $this->actingAsApi($this->agent)->postJson("/api/invitations/{$invitation->id}/revoke")->assertOk();
        $this->assertSame(InvitationStatus::Revoked, $invitation->refresh()->status);
    }

    public function test_la_fiche_lit_les_gestes_dans_abilities_quand_la_selection_porte_ce_que_la_regle_lit(): void
    {
        $invitation = $this->inviterSonClient();
        $fiche = $invitation->invitable_id;

        $this->actingAsApi($this->agent)
            ->getJson("/api/invitations?filter[customer_id]={$fiche}&fields[invitations]=id,status,agency_id,invited_by,invitable_type,invitable_id")
            ->assertOk()
            ->assertJsonPath('data.0.abilities', ['resend' => true, 'revoke' => true]);

        // Une sélection qui tait l'émetteur ne juge pas sur une colonne absente : pas d'`abilities`.
        $this->actingAsApi($this->agent)
            ->getJson("/api/invitations?filter[customer_id]={$fiche}&fields[invitations]=id,status,agency_id")
            ->assertOk()
            ->assertJsonMissingPath('data.0.abilities');
    }

    public function test_un_autre_agent_de_l_agence_n_y_touche_pas(): void
    {
        $invitation = $this->inviterSonClient();
        $collegue = $this->agentWithout($this->agence, Capability::TeamInvite);

        $this->actingAsApi($collegue)->postJson("/api/invitations/{$invitation->id}/resend")->assertForbidden();
        $this->actingAsApi($collegue)->postJson("/api/invitations/{$invitation->id}/revoke")->assertForbidden();
    }

    public function test_l_emetteur_suspendu_dans_l_agence_n_y_touche_plus(): void
    {
        $invitation = $this->inviterSonClient();
        AgentProfile::query()->where('user_id', $this->agent->id)->where('agency_id', $this->agence->id)->update(['status' => 'suspended']);

        $this->actingAsApi($this->agent)->postJson("/api/invitations/{$invitation->id}/resend")->assertForbidden();
        $this->actingAsApi($this->agent)->postJson("/api/invitations/{$invitation->id}/revoke")->assertForbidden();
    }

    public function test_une_invitation_d_equipe_emise_par_l_agent_reste_sous_team_invite(): void
    {
        // Sa cible coïncide avec une fiche que l'agent peut inviter : c'est le TYPE qui tranche.
        $fiche = Customer::factory()->create(['agency_id' => $this->agence->id, 'added_by_id' => $this->agent->id, 'user_id' => null]);
        $equipe = Invitation::factory()->create([
            'agency_id' => $this->agence->id,
            'role' => 'agent',
            'invited_by' => $this->agent->id,
            'invitable_type' => (new AgentProfile)->getMorphClass(),
            'invitable_id' => $fiche->id,
        ]);

        $this->actingAsApi($this->agent)->postJson("/api/invitations/{$equipe->id}/resend")->assertForbidden();
        $this->actingAsApi($this->agent)->postJson("/api/invitations/{$equipe->id}/revoke")->assertForbidden();
    }
}

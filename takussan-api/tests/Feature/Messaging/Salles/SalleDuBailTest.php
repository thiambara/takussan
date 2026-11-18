<?php

namespace Tests\Feature\Messaging\Salles;

use App\Models\Customer;
use App\Models\Enums\ConversationType;
use App\Models\Enums\LeaseStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Services\Membership\TeamMemberSuspensionService;
use App\Services\Messaging\ConversationAccess;
use App\Services\Model\CustomerService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Support\ScenesDeSalles;

/**
 * TCK-2960 (ADR-0128 § 2, AC1, AC2, AC4) — la salle d'un bail : ses membres sont exactement ses parties
 * (le compte du locataire, le bailleur, l'agent), après chaque changement de partie ; elle se lit tant que
 * le membre lit le bail ; elle ne s'écrit plus quand le bail est fini.
 */
class SalleDuBailTest extends ApiTestCase
{
    use RefreshDatabase, ScenesDeSalles;

    public function test_le_bail_cree_a_sa_salle_avec_ses_trois_parties(): void
    {
        ['lease' => $lease, 'landlord' => $landlord, 'agent' => $agent, 'tenant' => $tenant, 'property' => $property] = $this->sceneDuBail();

        $salle = $this->salleDe($lease);
        $this->assertNotNull($salle);
        $this->assertSame(ConversationType::Lease, $salle->type);
        $this->assertSame('lease', $salle->subject_type);
        $this->assertSame($lease->id, $salle->subject_id);
        $this->assertSame($lease->id, (int) $salle->lease_id);
        $this->assertSame($property->id, (int) $salle->property_id);
        $this->assertNull($salle->subject, 'le titre reste nul : le front nomme la salle');
        $this->assertSame($agent->id, (int) $salle->created_by, 'créée au nom de l\'agent');
        $this->assertSame($this->ids([$landlord, $agent, $tenant]), $this->membresActifs($salle));
    }

    public function test_un_brouillon_a_aussi_sa_salle(): void
    {
        ['lease' => $lease] = $this->sceneDuBail(['status' => LeaseStatus::Draft]);

        $this->assertNotNull($this->salleDe($lease));
    }

    public function test_changer_d_agent_fait_sortir_l_ancien_et_entrer_le_nouveau(): void
    {
        ['lease' => $lease, 'agency' => $agency, 'landlord' => $landlord, 'agent' => $agent, 'tenant' => $tenant] = $this->sceneDuBail();
        $nouveau = $this->agentDe($agency);

        $lease->update(['agent_id' => $nouveau->id]);

        $salle = $this->salleDe($lease);
        $this->assertSame($this->ids([$landlord, $nouveau, $tenant]), $this->membresActifs($salle));
        $this->assertNotNull($salle->participants()->where('users.id', $agent->id)->first()->pivot->left_at, 'l\'ancien agent part (left_at)');
        $this->assertFalse(app(ConversationAccess::class)->allows($agent, $salle->fresh()));
    }

    public function test_changer_de_bailleur_et_de_locataire(): void
    {
        ['lease' => $lease, 'agency' => $agency, 'agent' => $agent] = $this->sceneDuBail();
        $bailleur = User::factory()->create();
        $locataire = User::factory()->create();
        $fiche = Customer::factory()->create(['user_id' => $locataire->id, 'agency_id' => $agency->id]);

        $lease->update(['landlord_id' => $bailleur->id, 'tenant_id' => $fiche->id]);

        $this->assertSame($this->ids([$bailleur, $agent, $locataire]), $this->membresActifs($this->salleDe($lease)));
    }

    public function test_l_ancien_membre_qui_redevient_partie_revient(): void
    {
        ['lease' => $lease, 'agency' => $agency, 'agent' => $agent] = $this->sceneDuBail();
        $autre = $this->agentDe($agency);
        $lease->update(['agent_id' => $autre->id]);
        $lease->update(['agent_id' => $agent->id]);

        $salle = $this->salleDe($lease);
        $this->assertContains($agent->id, $this->membresActifs($salle));
        $this->assertNotContains($autre->id, $this->membresActifs($salle));
        $this->assertSame(1, $salle->participants()->where('users.id', $agent->id)->count(), 'une seule ligne, rouverte');
    }

    public function test_le_locataire_sans_compte_entre_quand_sa_fiche_est_liee(): void
    {
        ['lease' => $lease, 'agency' => $agency, 'landlord' => $landlord, 'agent' => $agent] = $this->sceneDuBail([
            'tenant_id' => Customer::factory()->create(['user_id' => null])->id,
        ]);
        $salle = $this->salleDe($lease);
        $this->assertSame($this->ids([$landlord, $agent]), $this->membresActifs($salle), 'sans compte : pas membre');

        $compte = User::factory()->create();
        app(CustomerService::class)->linkUser($lease->tenant, $compte);

        $this->assertSame($this->ids([$landlord, $agent, $compte]), $this->membresActifs($salle));
        $this->assertTrue(app(ConversationAccess::class)->allows($compte, $salle->fresh()));
    }

    /** @return array<string, array{LeaseStatus, bool}> */
    public static function statuts(): array
    {
        return [
            'draft' => [LeaseStatus::Draft, true],
            'pending_signature' => [LeaseStatus::PendingSignature, true],
            'active' => [LeaseStatus::Active, true],
            'terminating' => [LeaseStatus::Terminating, true],
            'expired' => [LeaseStatus::Expired, false],
            'terminated' => [LeaseStatus::Terminated, false],
            'renewed' => [LeaseStatus::Renewed, false],
        ];
    }

    #[DataProvider('statuts')]
    public function test_un_bail_fini_se_lit_et_ne_s_ecrit_plus(LeaseStatus $statut, bool $ecriture): void
    {
        ['lease' => $lease, 'tenant' => $tenant, 'agent' => $agent] = $this->sceneDuBail(['status' => $statut]);
        $salle = $this->salleDe($lease);
        $access = app(ConversationAccess::class);

        foreach ([$tenant, $agent] as $membre) {
            $this->assertTrue($access->allows($membre, $salle), 'la lecture reste');
            $this->assertSame($ecriture, $access->allowsWriting($membre, $salle));
        }

        $this->actingAsApi($tenant);
        $this->apiGet("/api/conversations/{$salle->id}")->assertOk()->assertJsonPath('data.abilities.can_send_message', $ecriture);
        $envoi = $this->apiPost("/api/conversations/{$salle->id}/messages", ['content' => 'Bonjour']);
        $ecriture ? $envoi->assertCreated() : $envoi->assertForbidden();
    }

    public function test_le_bailleur_suspendu_lit_et_n_ecrit_plus(): void
    {
        ['lease' => $lease, 'agency' => $agency, 'landlord' => $landlord] = $this->sceneDuBail();
        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);
        $salle = $this->salleDe($lease);
        $access = app(ConversationAccess::class);
        $this->assertTrue($access->allowsWriting($landlord, $salle), 'témoin : avant la suspension');

        app(TeamMemberSuspensionService::class)->suspend($agency, $landlord, $admin);

        $this->assertTrue($access->allows($landlord->fresh(), $salle->fresh()));
        $this->assertFalse($access->allowsWriting($landlord->fresh(), $salle->fresh()));
    }

    public function test_le_membre_qui_ne_lit_plus_le_bail_perd_la_salle_en_lecture_et_dans_la_liste(): void
    {
        ['lease' => $lease, 'agency' => $agency, 'agent' => $agent, 'tenant' => $tenant] = $this->sceneDuBail();
        $salle = $this->salleDe($lease);
        $access = app(ConversationAccess::class);
        $this->assertTrue($access->allows($agent, $salle), 'témoin');
        $this->assertSame([$salle->id], $access->participatingQuery($agent)->pluck('id')->all(), 'témoin');

        // Retiré de l'agence : son profil disparaît, il reste `agent_id` du bail et participant de la salle.
        AgentProfile::query()->where('user_id', $agent->id)->where('agency_id', $agency->id)->delete();
        $agent = $agent->fresh();
        $this->assertFalse($agent->can('view', $lease->fresh()), 'prémisse : il ne lit plus le bail');

        $this->assertFalse($access->allows($agent, $salle->fresh()));
        $this->assertSame([], $access->participatingQuery($agent)->pluck('id')->all());
        $this->actingAsApi($agent);
        $this->assertNotContains($salle->id, collect($this->apiGet('/api/conversations')->assertOk()->json('data'))->pluck('id')->all());
        $this->apiGet("/api/conversations/{$salle->id}/messages")->assertForbidden();

        $this->assertTrue($access->allows($tenant, $salle->fresh()), 'le locataire garde sa salle');
    }

    public function test_un_bail_supprime_rend_sa_salle_illisible(): void
    {
        ['lease' => $lease, 'tenant' => $tenant] = $this->sceneDuBail();
        $salle = $this->salleDe($lease);

        $lease->delete();

        $this->assertFalse(app(ConversationAccess::class)->allows($tenant, $salle->fresh()));
        $this->assertSame([], app(ConversationAccess::class)->participatingQuery($tenant)->pluck('id')->all());
    }

    public function test_la_liste_montre_la_salle_a_ses_membres_qui_lisent_le_bail_et_a_eux_seuls(): void
    {
        ['lease' => $lease, 'agency' => $agency, 'landlord' => $landlord, 'agent' => $agent, 'tenant' => $tenant] = $this->sceneDuBail();
        $salle = $this->salleDe($lease);
        $collegue = $this->agentDe($agency);

        foreach ([$landlord, $agent, $tenant] as $membre) {
            $this->actingAsApi($membre);
            $this->assertContains($salle->id, collect($this->apiGet('/api/conversations')->assertOk()->json('data'))->pluck('id')->all());
        }

        // Un collègue lit le bail (personnel de l'agence) sans être partie : ni membre, ni la salle.
        $this->assertTrue($collegue->can('view', $lease));
        $this->actingAsApi($collegue);
        $this->assertNotContains($salle->id, collect($this->apiGet('/api/conversations')->assertOk()->json('data'))->pluck('id')->all());
        $this->apiGet("/api/conversations/{$salle->id}")->assertForbidden();
    }
}

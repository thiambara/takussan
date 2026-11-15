<?php

namespace Tests\Feature\Owners;

use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\ConversationType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\ParticipantRole;
use App\Models\Enums\RelationshipType;
use App\Models\Lease;
use App\Models\Message;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2753 (S2 de la contre-vérification ; demande de team-lead du 2026-11-13, dans l'esprit de q1) —
 * le bailleur parti ou suspendu n'ouvre plus de fil neuf ni n'ajoute personne à un fil, par ce que
 * l'agence quittée lui ouvrait : le fil de son bail (règle 1 de `MessagingReach`), les fiches clients
 * de l'agence (règle 2), son équipe (règles 3 et 4). Avant la garde, la sonde S2 rendait 201 pour une
 * directe vers le locataire et vers l'agent du fil, et pour un groupe.
 *
 * Le sélecteur (`GET /api/conversations/contacts`) et le serveur lisent la même règle : chaque refus
 * est affirmé des deux côtés. Jugé par AGENCE : ses autres agences, et ce qu'il tient comme
 * locataire, ne changent pas. Le locataire n'est pas concerné : il joint toujours son ancien bailleur.
 *
 * Fixture : une agence A, son administrateur Ad, un agent Ag, le bailleur L (profil P dans A), un
 * locataire T, un bien SUPPRIMÉ portant un bail `terminated`, et le fil de ce bail entre L, T et Ag.
 */
class OwnerDepartedReachTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $agent;

    private User $landlord;

    private User $tenant;

    private OwnerProfile $profile;

    private Customer $fiche;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-20 10:00:00');
        $this->agency = Agency::factory()->create(['kind' => AgencyKind::Standard, 'commission_rate' => 8, 'is_verified' => true]);
        $this->admin = $this->agencyAdmin($this->agency);
        $this->agent = $this->agencyAgent($this->agency);
        $this->landlord = User::factory()->withOwnerProfile($this->agency)->create(['phone_verified_at' => now()]);
        $this->profile = OwnerProfile::query()->where('user_id', $this->landlord->id)->firstOrFail();
        $this->tenant = User::factory()->create();
        $this->fiche = Customer::factory()->create(['user_id' => $this->tenant->id, 'agency_id' => $this->agency->id]);
        $property = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->landlord->id]);
        $lease = Lease::factory()->create([
            'property_id' => $property->id, 'agency_id' => $this->agency->id, 'landlord_id' => $this->landlord->id,
            'tenant_id' => $this->fiche->id, 'status' => LeaseStatus::Terminated, 'commission_rate' => 10,
        ]);
        $property->delete();
        $this->filDeBail($lease, [$this->landlord, $this->tenant, $this->agent]);
    }

    /** @param  list<User>  $membres */
    private function filDeBail(Lease $lease, array $membres): Conversation
    {
        $fil = Conversation::factory()->create(['created_by' => $membres[0]->id, 'lease_id' => $lease->id]);
        foreach ($membres as $u) {
            $fil->participants()->attach($u->id, ['joined_at' => now()]);
        }

        return $fil;
    }

    private function asUser(User $u): void
    {
        $this->app['auth']->forgetGuards();
        $this->actingAs($u->fresh(), 'sanctum');
    }

    private function partir(): void
    {
        $this->asUser($this->admin);
        $this->deleteJson("/api/owners/{$this->profile->id}")->assertOk();
        $this->assertSame(OwnerProfileStatus::Inactive, $this->profile->fresh()->status);
        $this->asUser($this->landlord);
    }

    private function directe(User $vers): TestResponse
    {
        return $this->postJson('/api/conversations', ['participants' => [$vers->id], 'initial_message' => 'Bonjour']);
    }

    private function groupe(User ...$membres): TestResponse
    {
        return $this->postJson('/api/conversations', [
            'type' => 'group', 'subject' => 'Groupe', 'participants' => array_map(fn (User $u) => $u->id, $membres),
        ]);
    }

    /** @return list<int> */
    private function contacts(): array
    {
        return collect($this->getJson('/api/conversations/contacts')->assertOk()->json('data'))
            ->pluck('id')->map(fn ($id) => (int) $id)->all();
    }

    private function assertHorsDAtteinte(User ...$personnes): void
    {
        $avant = Conversation::query()->count();
        foreach ($personnes as $u) {
            $this->assertNotContains((int) $u->id, $this->contacts(), "le sélecteur ne propose plus {$u->id}");
            $this->directe($u)->assertStatus(422)->assertJsonValidationErrors('participants');
        }
        $this->groupe(...$personnes)->assertStatus(422)->assertJsonValidationErrors('participants');
        $this->assertSame($avant, Conversation::query()->count(), 'aucun fil ne naît');
    }

    public function test_temoin_le_bailleur_actif_ouvre_des_fils_avec_ceux_de_son_bail(): void
    {
        $this->asUser($this->landlord);

        $this->assertEqualsCanonicalizing([$this->tenant->id, $this->agent->id], array_values(array_intersect(
            $this->contacts(), [$this->tenant->id, $this->agent->id],
        )));
        $this->directe($this->tenant)->assertCreated();
        $this->groupe($this->tenant, $this->agent)->assertCreated();
    }

    public function test_le_bailleur_parti_n_ouvre_plus_de_fil_par_le_fil_de_son_bail(): void
    {
        $this->partir();

        $this->assertHorsDAtteinte($this->tenant, $this->agent);
    }

    public function test_le_bailleur_suspendu_non_plus(): void
    {
        $this->profile->forceFill(['status' => OwnerProfileStatus::Blocked])->save();
        $this->asUser($this->landlord);

        $this->assertHorsDAtteinte($this->tenant, $this->agent);
    }

    public function test_une_fiche_client_de_l_agence_quittee_ne_le_relie_plus(): void
    {
        $voisin = User::factory()->create();
        $autreFiche = Customer::factory()->create(['user_id' => $voisin->id, 'agency_id' => $this->agency->id]);
        UserCustomerRelationship::create([
            'user_id' => $this->landlord->id, 'customer_id' => $autreFiche->id,
            'relationship_type' => RelationshipType::OwnerTenant->value, 'is_primary' => true, 'status' => 'active',
        ]);
        UserCustomerRelationship::create([
            'user_id' => $this->landlord->id, 'customer_id' => $this->fiche->id,
            'relationship_type' => RelationshipType::OwnerTenant->value, 'is_primary' => true, 'status' => 'active',
        ]);
        $agentDeLaFiche = $this->agencyAgent($this->agency);
        UserCustomerRelationship::create([
            'user_id' => $agentDeLaFiche->id, 'customer_id' => $autreFiche->id,
            'relationship_type' => RelationshipType::AgentClient->value, 'is_primary' => false, 'status' => 'active',
        ]);
        $this->asUser($this->landlord);
        $this->assertContains((int) $voisin->id, $this->contacts(), 'témoin : la fiche le relie avant le départ');
        $this->assertContains((int) $agentDeLaFiche->id, $this->contacts(), 'témoin : la fiche le relie avant le départ');

        $this->partir();

        $this->assertHorsDAtteinte($voisin, $agentDeLaFiche);
    }

    public function test_l_ajout_a_un_groupe_passe_par_la_meme_regle(): void
    {
        $groupe = Conversation::factory()->create(['created_by' => $this->landlord->id, 'type' => ConversationType::Group]);
        $groupe->participants()->attach($this->landlord->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);
        $groupe->participants()->attach($this->tenant->id, ['joined_at' => now()]);
        $this->partir();

        $this->postJson("/api/conversations/{$groupe->id}/participants", ['user_ids' => [$this->agent->id]])
            ->assertStatus(422)->assertJsonValidationErrors('user_ids');
        $this->assertNotContains((int) $this->agent->id, collect($this->getJson("/api/conversations/{$groupe->id}/contacts")->assertOk()->json('data'))
            ->pluck('id')->map(fn ($id) => (int) $id)->all());
        $this->assertSame(2, $groupe->participants()->count());
    }

    public function test_le_locataire_joint_toujours_son_ancien_bailleur(): void
    {
        $this->partir();
        $this->asUser($this->tenant);

        $this->assertContains((int) $this->landlord->id, $this->contacts());
        $this->directe($this->landlord)->assertCreated();
    }

    public function test_ce_qu_il_tient_comme_locataire_de_l_agence_quittee_reste(): void
    {
        $sonBailleur = User::factory()->withOwnerProfile($this->agency)->create();
        $saFiche = Customer::factory()->create(['user_id' => $this->landlord->id, 'agency_id' => $this->agency->id]);
        $bien = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $sonBailleur->id]);
        $bail = Lease::factory()->create([
            'property_id' => $bien->id, 'agency_id' => $this->agency->id, 'landlord_id' => $sonBailleur->id,
            'tenant_id' => $saFiche->id, 'status' => LeaseStatus::Active, 'commission_rate' => 10,
        ]);
        $agentDuBail = $this->agencyAgent($this->agency);
        $this->filDeBail($bail, [$this->landlord, $agentDuBail]);
        $this->partir();

        $this->assertContains((int) $agentDuBail->id, $this->contacts());
        $this->directe($agentDuBail)->assertCreated();
        $this->assertNotContains((int) $this->tenant->id, $this->contacts(), 'le fil de SON bien reste fermé');
    }

    public function test_son_autre_agence_ne_change_pas(): void
    {
        $autre = Agency::factory()->create(['kind' => AgencyKind::Standard, 'commission_rate' => 8, 'is_verified' => true]);
        OwnerProfile::query()->create(['user_id' => $this->landlord->id, 'agency_id' => $autre->id, 'status' => OwnerProfileStatus::Active]);
        $locataireB = User::factory()->create();
        $ficheB = Customer::factory()->create(['user_id' => $locataireB->id, 'agency_id' => $autre->id]);
        $bienB = Property::factory()->create(['agency_id' => $autre->id, 'user_id' => $this->landlord->id]);
        $bailB = Lease::factory()->create([
            'property_id' => $bienB->id, 'agency_id' => $autre->id, 'landlord_id' => $this->landlord->id,
            'tenant_id' => $ficheB->id, 'status' => LeaseStatus::Active, 'commission_rate' => 10,
        ]);
        $this->filDeBail($bailB, [$this->landlord, $locataireB]);
        $this->partir();

        $this->assertContains((int) $locataireB->id, $this->contacts());
        $this->directe($locataireB)->assertCreated();
        $this->assertNotContains((int) $this->tenant->id, $this->contacts());
    }

    /**
     * Règle 4 : l'équipe de l'agence du bien d'un groupe qu'il complète. Le bailleur SUSPENDU garde ses
     * biens (le parti n'en a plus : le bien du fil serait supprimé, et la règle ne lit pas un bien supprimé).
     */
    public function test_l_equipe_de_l_agence_ne_s_ajoute_plus_au_groupe_du_bail_du_bailleur_suspendu(): void
    {
        $bien = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->landlord->id]);
        $bail = Lease::factory()->create([
            'property_id' => $bien->id, 'agency_id' => $this->agency->id, 'landlord_id' => $this->landlord->id,
            'tenant_id' => $this->fiche->id, 'status' => LeaseStatus::Active, 'commission_rate' => 10,
        ]);
        $groupe = Conversation::factory()->create(['created_by' => $this->landlord->id, 'type' => ConversationType::Group, 'lease_id' => $bail->id]);
        $groupe->participants()->attach($this->landlord->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);
        $groupe->participants()->attach($this->tenant->id, ['joined_at' => now()]);
        $this->asUser($this->landlord);
        $this->assertContains((int) $this->admin->id, $this->contactsDu($groupe), 'témoin avant la suspension');

        $this->profile->forceFill(['status' => OwnerProfileStatus::Blocked])->save();
        $this->asUser($this->landlord);

        $this->assertNotContains((int) $this->admin->id, $this->contactsDu($groupe));
        $this->postJson("/api/conversations/{$groupe->id}/participants", ['user_ids' => [$this->admin->id]])
            ->assertStatus(422)->assertJsonValidationErrors('user_ids');
        $this->assertSame(2, $groupe->participants()->count());
    }

    /**
     * Règle 3 : l'agence active ne peut pas être l'agence quittée — le profil parti ne se désigne pas.
     * `MessagingReach` ne la garde donc pas ; ce test épingle la prémisse.
     */
    public function test_le_profil_parti_ne_se_designe_pas_comme_agence_active(): void
    {
        $this->asUser($this->landlord);
        $this->assertContains((int) $this->admin->id, $this->contacts(), 'témoin : règle 3 avant le départ');

        $this->partir();

        $this->withHeader('X-Profile-Id', (string) $this->profile->id)->getJson('/api/conversations/contacts')->assertForbidden();
        $this->flushHeaders();
        $this->assertNotContains((int) $this->admin->id, $this->contacts());
        $this->directe($this->admin)->assertStatus(422)->assertJsonValidationErrors('participants');
    }

    /**
     * r1 de la contre-vérification de 2eba3431c — les directes SIMPLES gardées ouvertes (décision du
     * 2026-11-13) laissent l'agent et le locataire joignables ; elles ne doivent pas servir à rattacher
     * un fil NEUF au bail ou au bien de l'agence quittée. Avant la garde : 201 et 201 (sonde p1, p2).
     */
    private function directeSimple(User $a, User $b): void
    {
        $c = Conversation::factory()->create(['created_by' => $a->id, 'type' => ConversationType::Direct]);
        $c->participants()->attach($a->id, ['joined_at' => now()]);
        $c->participants()->attach($b->id, ['joined_at' => now()]);
    }

    private function bailActif(): Lease
    {
        $bien = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->landlord->id]);

        return Lease::factory()->create([
            'property_id' => $bien->id, 'agency_id' => $this->agency->id, 'landlord_id' => $this->landlord->id,
            'tenant_id' => $this->fiche->id, 'status' => LeaseStatus::Active, 'commission_rate' => 10,
        ]);
    }

    private function directeRattachee(User $vers, Lease $bail): TestResponse
    {
        return $this->postJson('/api/conversations', ['participants' => [$vers->id], 'lease_id' => $bail->id, 'initial_message' => 'Bonjour']);
    }

    public function test_temoin_le_bailleur_actif_rattache_un_fil_a_son_bail(): void
    {
        $bail = $this->bailActif();
        $this->asUser($this->landlord);

        $this->directeRattachee($this->agent, $bail)->assertCreated();
        $this->postJson('/api/conversations', [
            'type' => 'group', 'subject' => 'G', 'participants' => [$this->agent->id, $this->tenant->id],
            'lease_id' => $bail->id, 'property_id' => $bail->property_id,
        ])->assertCreated();
    }

    public function test_p1_le_bailleur_suspendu_ne_rattache_plus_de_fil_a_son_bail_ni_a_son_bien(): void
    {
        $bail = $this->bailActif();
        $this->directeSimple($this->landlord, $this->agent);
        $this->directeSimple($this->landlord, $this->tenant);
        $this->profile->forceFill(['status' => OwnerProfileStatus::Blocked])->save();
        $this->asUser($this->landlord);
        $avant = Conversation::query()->count();

        $this->directeRattachee($this->agent, $bail)->assertStatus(422)->assertJsonValidationErrors('lease_id');
        $this->postJson('/api/conversations', [
            'type' => 'group', 'subject' => 'G', 'participants' => [$this->agent->id, $this->tenant->id],
            'lease_id' => $bail->id, 'property_id' => $bail->property_id,
        ])->assertStatus(422)->assertJsonValidationErrors(['lease_id', 'property_id']);
        $this->postJson('/api/conversations', [
            'type' => 'group', 'subject' => 'G', 'participants' => [$this->agent->id], 'property_id' => $bail->property_id,
        ])->assertStatus(422)->assertJsonValidationErrors('property_id');
        $this->assertSame($avant, Conversation::query()->count(), 'aucun fil ne naît');

        // Les directes simples, elles, restent ouvertes (décision du 2026-11-13).
        $this->postJson('/api/conversations', ['participants' => [$this->agent->id], 'initial_message' => 'Bonjour'])->assertSuccessful();
    }

    public function test_p2_le_parti_ne_rattache_plus_de_fil_ni_n_y_ecrit_par_le_message_initial(): void
    {
        $this->directeSimple($this->landlord, $this->agent);
        $this->directeSimple($this->landlord, $this->tenant);
        $bail = Lease::query()->firstOrFail();
        $this->partir();
        $avant = [Conversation::query()->count(), Message::query()->count()];

        $this->directeRattachee($this->agent, $bail)->assertStatus(422)->assertJsonValidationErrors('lease_id');
        $this->postJson('/api/conversations', [
            'type' => 'group', 'subject' => 'G', 'participants' => [$this->agent->id, $this->tenant->id], 'lease_id' => $bail->id,
        ])->assertStatus(422)->assertJsonValidationErrors('lease_id');
        $this->assertSame($avant, [Conversation::query()->count(), Message::query()->count()], 'ni fil ni message');
    }

    public function test_le_bail_dont_il_est_le_locataire_se_rattache_toujours(): void
    {
        $sonBailleur = User::factory()->withOwnerProfile($this->agency)->create();
        $saFiche = Customer::factory()->create(['user_id' => $this->landlord->id, 'agency_id' => $this->agency->id]);
        $bien = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $sonBailleur->id]);
        $bail = Lease::factory()->create([
            'property_id' => $bien->id, 'agency_id' => $this->agency->id, 'landlord_id' => $sonBailleur->id,
            'tenant_id' => $saFiche->id, 'status' => LeaseStatus::Active, 'commission_rate' => 10,
        ]);
        $agentDuBail = $this->agencyAgent($this->agency);
        $this->filDeBail($bail, [$this->landlord, $agentDuBail]);
        $this->partir();

        // 200 ou 201 : la directe existante est reprise (`firstOrCreate`) ; ce qui compte, aucun refus.
        $this->directeRattachee($agentDuBail, $bail)->assertSuccessful();
    }

    /**
     * r1 de la vérification de 8d4d0f5f9 — les listes de contextes du groupe
     * (`GET /api/conversations/context/{leases,properties}`) ne proposent que ce que la création
     * accepte : avant, le bailleur suspendu ou parti se voyait proposer le bail de l'agence quittée,
     * que `POST /api/conversations` refuse (422). Le bail qu'il y LOUE reste proposé et accepté.
     */
    public function test_r1_le_suspendu_ne_se_voit_proposer_que_ce_que_la_creation_accepte(): void
    {
        $sonBail = $this->bailActif();
        $loue = $this->bailQu_ilLoue();
        $this->profile->forceFill(['status' => OwnerProfileStatus::Blocked])->save();
        $this->asUser($this->landlord);

        ['baux' => $baux, 'biens' => $biens] = $this->contextesProposes();
        $this->assertNotContains((int) $sonBail->id, $baux, 'le bail de son bien dans l’agence quittée');
        $this->assertNotContains((int) $sonBail->property_id, $biens, 'son bien dans l’agence quittée');
        $this->assertContains((int) $loue->id, $baux, 'le bail qu’il loue reste proposé');
        $this->assertListeIncluseDansLaCreation($baux, $biens);
    }

    public function test_r1_le_parti_non_plus(): void
    {
        $ancienBail = Lease::query()->firstOrFail();
        $loue = $this->bailQu_ilLoue();
        $this->partir();

        ['baux' => $baux, 'biens' => $biens] = $this->contextesProposes();
        $this->assertNotContains((int) $ancienBail->id, $baux);
        $this->assertContains((int) $loue->id, $baux);
        $this->assertListeIncluseDansLaCreation($baux, $biens);
    }

    public function test_r1_temoin_le_bailleur_actif_se_voit_proposer_son_bail_et_son_bien(): void
    {
        $sonBail = $this->bailActif();
        $this->asUser($this->landlord);

        ['baux' => $baux, 'biens' => $biens] = $this->contextesProposes();
        $this->assertContains((int) $sonBail->id, $baux);
        $this->assertContains((int) $sonBail->property_id, $biens);
        $this->assertListeIncluseDansLaCreation($baux, $biens);
    }

    /** Un bail de l'agence dont le bailleur de la fixture est le LOCATAIRE. */
    private function bailQu_ilLoue(): Lease
    {
        $sonBailleur = User::factory()->withOwnerProfile($this->agency)->create();
        $saFiche = Customer::factory()->create(['user_id' => $this->landlord->id, 'agency_id' => $this->agency->id]);
        $bien = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $sonBailleur->id]);

        return Lease::factory()->create([
            'property_id' => $bien->id, 'agency_id' => $this->agency->id, 'landlord_id' => $sonBailleur->id,
            'tenant_id' => $saFiche->id, 'status' => LeaseStatus::Active, 'commission_rate' => 10,
        ]);
    }

    /** @return array{baux: list<int>, biens: list<int>} */
    private function contextesProposes(): array
    {
        $ids = fn (string $quoi) => collect($this->getJson("/api/conversations/context/{$quoi}")->assertOk()->json('data'))
            ->pluck('id')->map(fn ($id) => (int) $id)->all();

        return ['baux' => $ids('leases'), 'biens' => $ids('properties')];
    }

    /**
     * Chaque contexte proposé passe la garde de la création : aucune erreur sur son champ (les
     * participants peuvent en porter une autre, qui n'est pas jugée ici).
     *
     * @param  list<int>  $baux
     * @param  list<int>  $biens
     */
    private function assertListeIncluseDansLaCreation(array $baux, array $biens): void
    {
        foreach ($baux as $id) {
            $this->postJson('/api/conversations', [
                'type' => 'group', 'subject' => 'G', 'participants' => [$this->agent->id, $this->tenant->id], 'lease_id' => $id,
            ])->assertJsonMissingValidationErrors('lease_id');
        }
        foreach ($biens as $id) {
            $this->postJson('/api/conversations', [
                'type' => 'group', 'subject' => 'G', 'participants' => [$this->agent->id, $this->tenant->id], 'property_id' => $id,
            ])->assertJsonMissingValidationErrors('property_id');
        }
    }

    /** @return list<int> */
    private function contactsDu(Conversation $groupe): array
    {
        return collect($this->getJson("/api/conversations/{$groupe->id}/contacts")->assertOk()->json('data'))
            ->pluck('id')->map(fn ($id) => (int) $id)->all();
    }
}

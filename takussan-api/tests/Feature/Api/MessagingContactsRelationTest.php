<?php

namespace Tests\Feature\Api;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\RelationshipType;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;

/**
 * TCK-2745 — `GET /api/conversations/contacts` rend, pour chaque personne joignable, sa RELATION
 * avec l'appelant (`client`, `equipe`, `proprietaire`, `prestataire`, ou `null`) et une ligne de
 * détail sous forme de DONNÉES (le front possède le texte, principe 5) : le bien du dernier échange
 * d'un client, le rôle d'un membre de l'équipe, le nombre de biens d'un propriétaire.
 *
 * Le périmètre reste celui de `MessagingReach` (TCK-565) : la relation ÉTIQUETTE une personne déjà
 * joignable, elle n'en ajoute aucune. Et elle ne révèle rien que l'appelant ne puisse voir : une
 * personne d'une autre agence n'est jamais « équipe » ni « propriétaire », un client de l'agence
 * ne lit jamais le nombre de biens d'un autre bailleur.
 */
class MessagingContactsRelationTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agence;

    private Agency $ailleurs;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agence = Agency::factory()->create(['name' => 'Dakar Immo']);
        $this->ailleurs = Agency::factory()->create(['name' => 'Thiès Habitat']);
    }

    private function user(string $first, string $last): User
    {
        return User::factory()->create(['first_name' => $first, 'last_name' => $last]);
    }

    private function fil(User $a, User $b, ?Property $bien = null, ?Carbon $dernierMessage = null): Conversation
    {
        $conversation = Conversation::create([
            'type' => ($bien ? ConversationType::Property : ConversationType::Direct)->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'relation',
            'created_by' => $a->id,
            'property_id' => $bien?->id,
            'last_message_at' => $dernierMessage,
        ]);
        $conversation->participants()->attach($a->id, ['joined_at' => now()]);
        $conversation->participants()->attach($b->id, ['joined_at' => now()]);

        return $conversation;
    }

    private function bien(Agency $agence, User $proprietaire, string $titre, string $ville, array $attributs = []): Property
    {
        $bien = Property::factory()->create(['agency_id' => $agence->id, 'user_id' => $proprietaire->id, 'title' => $titre] + $attributs);
        Address::factory()->create([
            'addressable_type' => $bien->getMorphClass(),
            'addressable_id' => $bien->id,
            'city' => $ville,
        ]);

        return $bien;
    }

    /** Une fiche client d'agence dont `$client` est la personne, et `$referent` le rattaché. */
    private function fiche(Agency $agence, User $client, User $referent, RelationshipType $type = RelationshipType::AgentClient): Customer
    {
        $fiche = Customer::factory()->create(['agency_id' => $agence->id, 'user_id' => $client->id]);
        UserCustomerRelationship::create([
            'user_id' => $referent->id,
            'customer_id' => $fiche->id,
            'relationship_type' => $type->value,
            'status' => 'active',
            'is_primary' => true,
            'started_at' => now(),
        ]);

        return $fiche;
    }

    private function prestataire(string $first, string $last, Agency $agence): User
    {
        $user = $this->user($first, $last);
        $profil = ServiceProviderProfile::query()->create(['user_id' => $user->id]);
        ServiceProviderAgencyCollaboration::create([
            'service_provider_profile_id' => $profil->id,
            'agency_id' => $agence->id,
            'status' => CollaborationStatus::Active,
            'started_at' => now()->toDateString(),
        ]);

        return $user;
    }

    /** @return array<int, array{relation: ?string, detail: mixed}> */
    private function relations(string $query = ''): array
    {
        $data = $this->getJson('/api/conversations/contacts'.$query)->assertOk()->json('data');

        return collect($data)->mapWithKeys(fn ($c) => [(int) $c['id'] => ['relation' => $c['relation'], 'detail' => $c['detail']]])->all();
    }

    public function test_un_agent_recoit_la_relation_et_la_ligne_de_detail_de_chacun(): void
    {
        $moi = $this->user('Moussa', 'Ndiaye');
        $this->materializeRoleProfile($moi, 'agent', $this->agence);

        $admin = $this->user('Aïda', 'Sow');
        $this->materializeRoleProfile($admin, 'agency_admin', $this->agence);
        $collegue = $this->user('Babacar', 'Fall');
        $this->materializeRoleProfile($collegue, 'agent', $this->agence);

        $proprietaire = $this->user('Fatou', 'Diop');
        $this->materializeRoleProfile($proprietaire, 'owner', $this->agence);
        $this->bien($this->agence, $proprietaire, 'Villa A', 'Dakar');
        $maison = $this->bien($this->agence, $proprietaire, 'Maison avec jardin', 'Thiès');
        $this->bien($this->agence, $proprietaire, 'Supprimé', 'Dakar')->delete();
        $this->bien($this->agence, $proprietaire, 'Archivé', 'Dakar', ['archived_at' => now()]);
        $this->bien($this->ailleurs, $proprietaire, 'Ailleurs', 'Thiès');

        $client = $this->user('Awa', 'Sarr');
        $this->fiche($this->agence, $client, $moi);
        $studio = $this->bien($this->agence, $proprietaire, 'Studio', 'Dakar');
        $this->fil($moi, $client, $studio, now()->subDays(3));
        $this->fil($moi, $client, $maison, now()->subDay());
        $this->fil($moi, $client, null, now());

        $plombier = $this->prestataire('Ibou', 'Gaye', $this->agence);
        $this->fil($moi, $plombier);

        $correspondant = $this->user('Khady', 'Ba');
        $this->fil($moi, $correspondant);

        $this->actingAsApi($moi);
        $relations = $this->relations();

        $this->assertSame(['relation' => 'equipe', 'detail' => ['role' => 'admin']], $relations[$admin->id]);
        $this->assertSame(['relation' => 'equipe', 'detail' => ['role' => 'agent']], $relations[$collegue->id]);
        $this->assertSame(['relation' => 'proprietaire', 'detail' => ['properties_count' => 3]], $relations[$proprietaire->id],
            'trois biens vivants dans MON agence : ni le supprimé, ni l’archivé, ni celui d’une autre agence');
        $this->assertSame(['relation' => 'client', 'detail' => ['property' => ['title' => 'Maison avec jardin', 'city' => 'Thiès']]], $relations[$client->id],
            'le bien du dernier échange qui en a un');
        $this->assertSame(['relation' => 'prestataire', 'detail' => null], $relations[$plombier->id]);
        $this->assertSame(['relation' => null, 'detail' => null], $relations[$correspondant->id]);
    }

    public function test_aucune_relation_n_est_lue_dans_une_autre_agence(): void
    {
        $moi = $this->user('Moussa', 'Ndiaye');
        $this->materializeRoleProfile($moi, 'agent', $this->agence);

        // Joignables par un fil passé, mais liés à une AUTRE agence seulement.
        $agentAilleurs = $this->user('Ibrahima', 'Fall');
        $this->materializeRoleProfile($agentAilleurs, 'agent', $this->ailleurs);
        $adminAilleurs = $this->user('Ndeye', 'Fall');
        $this->materializeRoleProfile($adminAilleurs, 'agency_admin', $this->ailleurs);
        $proprietaireAilleurs = $this->user('Omar', 'Gueye');
        $this->materializeRoleProfile($proprietaireAilleurs, 'owner', $this->ailleurs);
        $this->bien($this->ailleurs, $proprietaireAilleurs, 'Ailleurs', 'Thiès');
        $prestataireAilleurs = $this->prestataire('Ibou', 'Gaye', $this->ailleurs);
        // Le client d'un AUTRE agent : je partage un fil avec lui, mais je ne suis pas rattaché à sa fiche.
        $autreAgent = $this->user('Babacar', 'Fall');
        $this->materializeRoleProfile($autreAgent, 'agent', $this->ailleurs);
        $clientDAutrui = $this->user('Awa', 'Sarr');
        $this->fiche($this->ailleurs, $clientDAutrui, $autreAgent);

        foreach ([$agentAilleurs, $adminAilleurs, $proprietaireAilleurs, $prestataireAilleurs, $clientDAutrui] as $u) {
            $this->fil($moi, $u);
        }

        $this->actingAsApi($moi);
        $relations = $this->relations();

        foreach ([$agentAilleurs, $adminAilleurs, $proprietaireAilleurs, $prestataireAilleurs, $clientDAutrui] as $u) {
            $this->assertArrayHasKey($u->id, $relations, 'joignable par le fil passé');
            $this->assertSame(['relation' => null, 'detail' => null], $relations[$u->id], $u->first_name.' '.$u->last_name);
        }
    }

    public function test_le_bien_du_dernier_echange_vient_d_un_fil_de_l_appelant(): void
    {
        $moi = $this->user('Moussa', 'Ndiaye');
        $this->materializeRoleProfile($moi, 'agent', $this->agence);
        $collegue = $this->user('Babacar', 'Fall');
        $this->materializeRoleProfile($collegue, 'agent', $this->agence);
        $proprietaire = $this->user('Fatou', 'Diop');

        $client = $this->user('Awa', 'Sarr');
        $this->fiche($this->agence, $client, $moi);
        $this->fil($moi, $client, $this->bien($this->agence, $proprietaire, 'Studio', 'Dakar'), now()->subDays(3));
        // Plus récent, mais entre le client et un collègue : ce fil n'est pas le mien.
        $this->fil($collegue, $client, $this->bien($this->agence, $proprietaire, 'Secret', 'Saly'), now());

        $this->actingAsApi($moi);

        $this->assertSame(['property' => ['title' => 'Studio', 'city' => 'Dakar']], $this->relations()[$client->id]['detail']);
    }

    public function test_un_fil_que_l_appelant_a_quitte_ne_compte_ni_pour_le_bien_ni_pour_le_tri(): void
    {
        $moi = $this->user('Moussa', 'Ndiaye');
        $this->materializeRoleProfile($moi, 'agent', $this->agence);
        $proprietaire = $this->user('Fatou', 'Diop');

        $client = $this->user('Awa', 'Sarr');
        $autre = $this->user('Bineta', 'Diallo');
        $this->fiche($this->agence, $client, $moi);
        $this->fiche($this->agence, $autre, $moi);
        $this->fil($moi, $client, $this->bien($this->agence, $proprietaire, 'Studio', 'Dakar'), now()->subDays(3));
        $this->fil($moi, $autre, null, now()->subDay());
        // Plus récent, mais j'en ai été retiré : ce fil n'est plus le mien.
        $quitte = $this->fil($moi, $client, $this->bien($this->agence, $proprietaire, 'Quitté', 'Saly'), now());
        $quitte->participants()->updateExistingPivot($moi->id, ['left_at' => now()]);

        $this->actingAsApi($moi);

        $this->assertSame(['property' => ['title' => 'Studio', 'city' => 'Dakar']], $this->relations()[$client->id]['detail']);
        $this->assertSame([$autre->id, $client->id], array_keys($this->relations('?filter[relation]=client&sort=-last_exchange_at')));
    }

    public function test_le_bailleur_parti_ne_lit_pas_le_bien_d_un_fil_de_l_agence_quittee(): void
    {
        // Bailleur parti de l'agence « ailleurs » (profil sans écriture), actif dans « agence ».
        $moi = $this->user('Fatou', 'Diop');
        $this->materializeRoleProfile($moi, 'owner', $this->agence);
        $this->materializeRoleProfile($moi, 'owner', $this->ailleurs);
        OwnerProfile::query()->where('user_id', $moi->id)->where('agency_id', $this->ailleurs->id)
            ->update(['status' => OwnerProfileStatus::sansEcriture()[0]->value]);

        $locataire = $this->user('Awa', 'Sarr');
        $this->fiche($this->agence, $locataire, $moi, RelationshipType::OwnerTenant);
        $this->fil($moi, $locataire, $this->bien($this->agence, $moi, 'Studio', 'Dakar'), now()->subDays(3));
        $this->fil($moi, $locataire, $this->bien($this->ailleurs, $moi, 'Fermé', 'Thiès'), now());

        $this->actingAsApi($moi);

        $this->assertSame(['relation' => 'client', 'detail' => ['property' => ['title' => 'Studio', 'city' => 'Dakar']]], $this->relations()[$locataire->id]);
    }

    public function test_un_client_sans_echange_avec_un_bien_a_un_detail_vide(): void
    {
        $moi = $this->user('Moussa', 'Ndiaye');
        $this->materializeRoleProfile($moi, 'agent', $this->agence);
        $client = $this->user('Awa', 'Sarr');
        $this->fiche($this->agence, $client, $moi);

        $this->actingAsApi($moi);

        $this->assertSame(['relation' => 'client', 'detail' => ['property' => null]], $this->relations()[$client->id]);
    }

    public function test_un_bailleur_ne_lit_ni_proprietaire_ni_prestataire(): void
    {
        $moi = $this->user('Fatou', 'Diop');
        $this->materializeRoleProfile($moi, 'owner', $this->agence);

        $agent = $this->user('Moussa', 'Ndiaye');
        $this->materializeRoleProfile($agent, 'agent', $this->agence);
        $locataire = $this->user('Awa', 'Sarr');
        $this->fiche($this->agence, $locataire, $moi, RelationshipType::OwnerTenant);

        // Joignables par un fil, mais leur lien à l'agence n'est pas à moi de le lire.
        $autreProprietaire = $this->user('Omar', 'Gueye');
        $this->materializeRoleProfile($autreProprietaire, 'owner', $this->agence);
        $this->bien($this->agence, $autreProprietaire, 'Villa', 'Dakar');
        $plombier = $this->prestataire('Ibou', 'Gaye', $this->agence);
        $this->fil($moi, $autreProprietaire);
        $this->fil($moi, $plombier);

        $this->actingAsApi($moi);
        $relations = $this->relations();

        $this->assertSame(['relation' => 'equipe', 'detail' => ['role' => 'agent']], $relations[$agent->id]);
        $this->assertSame('client', $relations[$locataire->id]['relation']);
        $this->assertSame(['relation' => null, 'detail' => null], $relations[$autreProprietaire->id]);
        $this->assertSame(['relation' => null, 'detail' => null], $relations[$plombier->id]);
        $this->assertSame([], $this->relations('?filter[relation]=proprietaire'));
        $this->assertSame([], $this->relations('?filter[relation]=prestataire'));
    }

    /**
     * Règle 3 (décision du 2026-11-14) : `proprietaire` et `prestataire` exigent le personnel actif ET
     * la policy du carnet. Un bailleur délégué `agent` est du personnel (ADR-0031 §1, la délégation
     * compte) et joint donc les bailleurs de l'agence, mais le carnet des bailleurs comme celui des
     * prestataires lui sont refusés (`viewAny` : un profil d'agent ou d'administrateur) : la relation
     * ne le lui dit pas non plus.
     */
    public function test_un_delegue_sans_carnet_ne_lit_ni_proprietaire_ni_prestataire(): void
    {
        $moi = $this->user('Fatou', 'Diop');
        $this->materializeRoleProfile($moi, 'owner', $this->agence);
        RoleDelegation::create([
            'user_id' => $moi->id,
            'delegator_id' => User::factory()->create()->id,
            'agency_id' => $this->agence->id,
            'role' => 'agent',
            'status' => RoleDelegationStatus::Active,
            'starts_at' => now()->subDay(),
            'ends_at' => now()->addDays(7),
            'activated_at' => now()->subDay(),
            'user_native_roles_snapshot' => ['owner'],
        ]);

        $autreProprietaire = $this->user('Omar', 'Gueye');
        $this->materializeRoleProfile($autreProprietaire, 'owner', $this->agence);
        $this->bien($this->agence, $autreProprietaire, 'Villa', 'Dakar');
        $plombier = $this->prestataire('Ibou', 'Gaye', $this->agence);
        $this->fil($moi, $plombier);

        $this->actingAsApi($moi);
        $relations = $this->relations();

        $this->assertArrayHasKey($autreProprietaire->id, $relations, 'le personnel délégué joint les bailleurs (règle 3 de MessagingReach)');
        $this->assertSame(['relation' => null, 'detail' => null], $relations[$autreProprietaire->id]);
        $this->assertSame(['relation' => null, 'detail' => null], $relations[$plombier->id]);
    }

    /** Règle 5 : `client` = une fiche à laquelle l'appelant est rattaché, pas toute la clientèle de l'agence. */
    public function test_le_client_d_un_collegue_n_est_pas_mon_client(): void
    {
        $moi = $this->user('Moussa', 'Ndiaye');
        $this->materializeRoleProfile($moi, 'agent', $this->agence);
        $collegue = $this->user('Babacar', 'Fall');
        $this->materializeRoleProfile($collegue, 'agent', $this->agence);

        $sonClient = $this->user('Awa', 'Sarr');
        $this->fiche($this->agence, $sonClient, $collegue);
        $this->fil($moi, $sonClient);

        $this->actingAsApi($moi);

        $this->assertSame(['relation' => null, 'detail' => null], $this->relations()[$sonClient->id]);
        $this->assertSame([], $this->relations('?filter[relation]=client'));
    }

    public function test_un_client_connecte_ne_recoit_que_ce_que_la_messagerie_lui_ouvre(): void
    {
        $agent = $this->user('Moussa', 'Ndiaye');
        $this->materializeRoleProfile($agent, 'agent', $this->agence);
        $proprietaire = $this->user('Fatou', 'Diop');
        $this->materializeRoleProfile($proprietaire, 'owner', $this->agence);
        $this->bien($this->agence, $proprietaire, 'Villa', 'Dakar');

        $moi = $this->user('Awa', 'Sarr');
        $this->fiche($this->agence, $moi, $agent);

        $this->actingAsApi($moi);
        $relations = $this->relations();

        // Le référent est joignable (règle 2c de MessagingReach), mais le client n'est pas de l'équipe :
        // aucune relation ne lui est prêtée, et le propriétaire de l'agence n'est pas dans sa liste.
        $this->assertSame([$agent->id => ['relation' => null, 'detail' => null]], $relations);
    }

    public function test_filter_relation_lit_une_section(): void
    {
        $moi = $this->user('Moussa', 'Ndiaye');
        $this->materializeRoleProfile($moi, 'agent', $this->agence);
        $collegue = $this->user('Babacar', 'Fall');
        $this->materializeRoleProfile($collegue, 'agent', $this->agence);
        $proprietaire = $this->user('Fatou', 'Diop');
        $this->materializeRoleProfile($proprietaire, 'owner', $this->agence);
        $client = $this->user('Awa', 'Sarr');
        $this->fiche($this->agence, $client, $moi);
        // Membre de l'équipe ET client : une seule relation, la plus forte (équipe).
        $collegueClient = $this->user('Coumba', 'Ndiaye');
        $this->materializeRoleProfile($collegueClient, 'agent', $this->agence);
        $this->fiche($this->agence, $collegueClient, $moi);

        $this->actingAsApi($moi);

        $this->assertSame([$client->id], array_keys($this->relations('?filter[relation]=client')));
        $equipe = array_keys($this->relations('?filter[relation]=equipe'));
        sort($equipe);
        $this->assertSame([$collegue->id, $collegueClient->id], $equipe);
        $this->assertSame([$proprietaire->id], array_keys($this->relations('?filter[relation]=proprietaire')));
        $this->assertSame([], $this->relations('?filter[relation]=inconnue'));
        $this->assertSame([], $this->relations('?filter[relation]='));
        $this->assertSame([], $this->relations('?filter[relation][]=client'));

        $this->getJson('/api/conversations/contacts?filter[relation]=client')->assertJsonPath('meta.total', 1);
    }

    /**
     * TCK-2830 — la dernière section de « Nouvelle conversation » : `filter[relation]=autre`, toute
     * personne joignable sans relation FORTE (équipe, propriétaire, client), donc un prestataire ou
     * personne sans relation. Les trois sections du dessus et celle-ci partitionnent le périmètre.
     */
    public function test_filter_relation_autre_rend_les_prestataires_et_les_sans_relation(): void
    {
        $moi = $this->user('Moussa', 'Ndiaye');
        $this->materializeRoleProfile($moi, 'agent', $this->agence);
        $collegue = $this->user('Babacar', 'Fall');
        $this->materializeRoleProfile($collegue, 'agent', $this->agence);
        $proprietaire = $this->user('Fatou', 'Diop');
        $this->materializeRoleProfile($proprietaire, 'owner', $this->agence);
        $client = $this->user('Awa', 'Sarr');
        $this->fiche($this->agence, $client, $moi);
        $plombier = $this->prestataire('Ibou', 'Gaye', $this->agence);
        $this->fil($moi, $plombier);
        $correspondant = $this->user('Khady', 'Ba');
        $this->fil($moi, $correspondant);
        // Prestataire ET client : la relation forte l'emporte, il n'est pas « autre ».
        $plombierClient = $this->prestataire('Omar', 'Gueye', $this->agence);
        $this->fiche($this->agence, $plombierClient, $moi);

        $this->actingAsApi($moi);

        $autres = $this->relations('?filter[relation]=autre');
        ksort($autres);
        $attendu = [
            $plombier->id => ['relation' => 'prestataire', 'detail' => null],
            $correspondant->id => ['relation' => null, 'detail' => null],
        ];
        ksort($attendu);
        $this->assertSame($attendu, $autres);

        $toutes = array_keys($this->relations('?per_page=100'));
        $sections = [];
        foreach (['equipe', 'proprietaire', 'client', 'autre'] as $code) {
            $sections = [...$sections, ...array_keys($this->relations('?per_page=100&filter[relation]='.$code))];
        }
        sort($toutes);
        sort($sections);
        $this->assertSame($toutes, $sections, 'les quatre sections couvrent le périmètre, sans doublon');
    }

    /**
     * TCK-2830 (décision de team-lead du 2026-11-14) — `autre` RESTREINT le périmètre de
     * {@see MessagingReach}, il ne l'élargit jamais : personne hors de la liste sans filtre, même
     * sans aucune relation (le cas que `autre` sélectionne), et pas plus par la porte d'un groupe.
     */
    public function test_filter_relation_autre_ne_sort_jamais_du_perimetre(): void
    {
        $moi = $this->user('Moussa', 'Ndiaye');
        $this->materializeRoleProfile($moi, 'agent', $this->agence);
        $correspondant = $this->user('Khady', 'Ba');
        $this->fil($moi, $correspondant);

        // Hors périmètre : aucun fil, aucune fiche, aucune agence en commun — et tous sans relation.
        $inconnu = $this->user('Inconnu', 'Total');
        $agentAilleurs = $this->user('Ibrahima', 'Fall');
        $this->materializeRoleProfile($agentAilleurs, 'agent', $this->ailleurs);
        $prestataireAilleurs = $this->prestataire('Ibou', 'Gaye', $this->ailleurs);
        $proprietaireAilleurs = $this->user('Omar', 'Gueye');
        $this->materializeRoleProfile($proprietaireAilleurs, 'owner', $this->ailleurs);
        $horsPerimetre = [$inconnu->id, $agentAilleurs->id, $prestataireAilleurs->id, $proprietaireAilleurs->id];

        $this->actingAsApi($moi);

        $toutes = array_keys($this->relations('?per_page=100'));
        $autres = array_keys($this->relations('?per_page=100&filter[relation]=autre'));
        $this->assertContains($correspondant->id, $autres, 'le correspondant sans relation est bien « autre »');
        $this->assertSame([], array_values(array_diff($autres, $toutes)), '« autre » ⊆ la liste sans filtre');
        $this->assertSame([], array_values(array_intersect($autres, $horsPerimetre)), 'aucune personne hors du périmètre');
        $this->assertNotContains($moi->id, $autres, 'jamais l’appelant lui-même');

        // La porte d'un groupe existant : même borne.
        $groupe = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'groupe',
            'created_by' => $moi->id,
        ]);
        $groupe->participants()->attach($moi->id, ['joined_at' => now(), 'role' => 'admin']);
        $porte = fn (string $q) => collect($this->getJson("/api/conversations/{$groupe->id}/contacts?per_page=100".$q)
            ->assertOk()->json('data'))->pluck('id')->map(fn ($id) => (int) $id)->all();
        $autresDuGroupe = $porte('&filter[relation]=autre');
        $this->assertContains($correspondant->id, $autresDuGroupe);
        $this->assertSame([], array_values(array_diff($autresDuGroupe, $porte(''))), 'porte du groupe : « autre » ⊆ sans filtre');
        $this->assertSame([], array_values(array_intersect($autresDuGroupe, $horsPerimetre)), 'porte du groupe : aucun hors-périmètre');
    }

    /** TCK-2830 — chez un bailleur, « autre » rend aussi ce que la relation lui tait (bailleurs, prestataires). */
    public function test_filter_relation_autre_chez_un_bailleur(): void
    {
        $moi = $this->user('Fatou', 'Diop');
        $this->materializeRoleProfile($moi, 'owner', $this->agence);
        $agent = $this->user('Moussa', 'Ndiaye');
        $this->materializeRoleProfile($agent, 'agent', $this->agence);
        $autreProprietaire = $this->user('Omar', 'Gueye');
        $this->materializeRoleProfile($autreProprietaire, 'owner', $this->agence);
        $this->bien($this->agence, $autreProprietaire, 'Villa', 'Dakar');
        $plombier = $this->prestataire('Ibou', 'Gaye', $this->agence);
        $this->fil($moi, $autreProprietaire);
        $this->fil($moi, $plombier);

        $this->actingAsApi($moi);

        $autres = array_keys($this->relations('?filter[relation]=autre'));
        sort($autres);
        $attendu = [$autreProprietaire->id, $plombier->id];
        sort($attendu);
        $this->assertSame($attendu, $autres);
        $this->assertSame([], $this->relations('?filter[relation]=proprietaire'));
    }

    public function test_le_tri_recent_range_les_clients_par_dernier_echange(): void
    {
        $moi = $this->user('Moussa', 'Ndiaye');
        $this->materializeRoleProfile($moi, 'agent', $this->agence);
        $collegue = $this->user('Babacar', 'Fall');
        $this->materializeRoleProfile($collegue, 'agent', $this->agence);

        $ancien = $this->user('Aminata', 'Ba');
        $recent = $this->user('Zeyna', 'Sy');
        $sansEchange = $this->user('Bineta', 'Diallo');
        foreach ([$ancien, $recent, $sansEchange] as $c) {
            $this->fiche($this->agence, $c, $moi);
        }
        $this->fil($moi, $ancien, null, now()->subDays(5));
        $this->fil($moi, $recent, null, now()->subHour());
        // Plus récent encore, mais avec un collègue : n'entre pas dans MON ordre.
        $this->fil($collegue, $ancien, null, now());

        $this->actingAsApi($moi);

        $ordre = array_keys($this->relations('?filter[relation]=client&sort=-last_exchange_at'));
        $this->assertSame([$recent->id, $ancien->id, $sansEchange->id], $ordre);
    }

    public function test_ne_rend_aucune_coordonnee(): void
    {
        $moi = $this->user('Moussa', 'Ndiaye');
        $this->materializeRoleProfile($moi, 'agent', $this->agence);
        $client = User::factory()->create(['first_name' => 'Awa', 'last_name' => 'Sarr', 'email' => 'awa@example.test', 'phone' => '+221770000001']);
        $this->fiche($this->agence, $client, $moi);
        $this->fil($moi, $client, $this->bien($this->agence, $moi, 'Studio', 'Dakar'), now());

        $this->actingAsApi($moi);
        $response = $this->getJson('/api/conversations/contacts')->assertOk();

        $this->assertSame(['avatar_url', 'detail', 'id', 'name', 'relation'], collect($response->json('data.0'))->keys()->sort()->values()->all());
        $this->assertSame(['property'], array_keys($response->json('data.0.detail')));
        $this->assertSame(['city', 'title'], collect($response->json('data.0.detail.property'))->keys()->sort()->values()->all());
        $this->assertStringNotContainsString('awa@example.test', $response->getContent());
        $this->assertStringNotContainsString('770000001', $response->getContent());
    }

    public function test_le_compte_de_requetes_ne_depend_pas_du_nombre_de_personnes(): void
    {
        $moi = $this->user('Moussa', 'Ndiaye');
        $this->materializeRoleProfile($moi, 'agent', $this->agence);
        $this->actingAsApi($moi);

        $peupler = function (int $n) use ($moi): void {
            for ($i = 0; $i < $n; $i++) {
                $admin = $this->user('Admin', 'N'.$i);
                $this->materializeRoleProfile($admin, $i % 2 ? 'agency_admin' : 'agent', $this->agence);
                $proprietaire = $this->user('Proprio', 'N'.$i);
                $this->materializeRoleProfile($proprietaire, 'owner', $this->agence);
                $client = $this->user('Client', 'N'.$i);
                $this->fiche($this->agence, $client, $moi);
                $this->fil($moi, $client, $this->bien($this->agence, $proprietaire, 'Bien '.$i, 'Dakar'), now()->subMinutes($i));
                $this->fil($moi, $this->prestataire('Presta', 'N'.$i, $this->agence));
            }
        };

        $compter = function (): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson('/api/conversations/contacts?per_page=100')->assertOk();
            $this->getJson('/api/conversations/contacts?per_page=100&filter[relation]=client&sort=-last_exchange_at')->assertOk();
            DB::disableQueryLog();

            return count(DB::getQueryLog());
        };

        $peupler(1);
        $avec4 = $compter();
        $peupler(5);
        $avec24 = $compter();

        $sections = collect($this->getJson('/api/conversations/contacts?per_page=100')->json('data'))->countBy('relation')->sort()->all();
        $this->assertSame(['client' => 6, 'equipe' => 6, 'prestataire' => 6, 'proprietaire' => 6], collect($sections)->sortKeys()->all(), 'les quatre sections sont bien calculées');

        $this->assertSame($avec4, $avec24, 'une requête par section au plus, jamais une par personne');
    }

    public function test_la_porte_d_un_groupe_existant_rend_aussi_la_relation(): void
    {
        $moi = $this->user('Moussa', 'Ndiaye');
        $this->materializeRoleProfile($moi, 'agent', $this->agence);
        $collegue = $this->user('Babacar', 'Fall');
        $this->materializeRoleProfile($collegue, 'agent', $this->agence);

        $groupe = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'groupe',
            'created_by' => $moi->id,
        ]);
        $groupe->participants()->attach($moi->id, ['joined_at' => now(), 'role' => 'admin']);

        $this->actingAsApi($moi);
        $response = $this->getJson("/api/conversations/{$groupe->id}/contacts")->assertOk();

        $this->assertSame('equipe', collect($response->json('data'))->firstWhere('id', $collegue->id)['relation']);
    }
}

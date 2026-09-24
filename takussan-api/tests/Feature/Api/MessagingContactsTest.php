<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\ParticipantRole;
use App\Models\Enums\RelationshipType;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use App\Services\Messaging\MessagingReach;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\InteractsWithMeilisearch;

/**
 * TCK-565 — `GET /api/conversations/contacts` : les personnes qu'un utilisateur peut inviter dans
 * une conversation de groupe, désignées par leur NOM.
 *
 * Retour testeur du 2026-09-23 (M12) : l'assistant « Nouveau groupe » demandait un « ID
 * utilisateur » — un identifiant numérique qu'aucun utilisateur ne connaît. Cet endpoint sert le
 * sélecteur par nom qui le remplace, et il ne liste QUE le périmètre que la création de groupe
 * accepte (`App\Services\Messaging\MessagingReach`) : un sélecteur qui proposerait une personne que
 * le serveur refuse ensuite reproduirait le défaut sous une autre forme.
 *
 * Les noms sont ÉCRITS, jamais tirés par la fabrique : la recherche est tolérante aux fautes, et
 * un nom tiré au hasard peut tomber dans sa portée (cf. `UserSearchTest`, TCK-462).
 */
class MessagingContactsTest extends ApiTestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private function user(string $first, string $last): User
    {
        return User::factory()->create(['first_name' => $first, 'last_name' => $last]);
    }

    private function shareConversation(User $a, User $b): void
    {
        $conversation = Conversation::create([
            'type' => ConversationType::Direct->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'relation',
            'created_by' => $a->id,
        ]);
        $conversation->participants()->attach($a->id, ['joined_at' => now()]);
        $conversation->participants()->attach($b->id, ['joined_at' => now()]);
    }

    /** @return list<int> */
    private function contactIds(string $query = ''): array
    {
        $response = $this->getJson('/api/conversations/contacts'.$query)->assertOk();

        return collect($response->json('data'))->pluck('id')->map(fn ($id) => (int) $id)->sort()->values()->all();
    }

    public function test_un_visiteur_anonyme_est_refuse(): void
    {
        $this->getJson('/api/conversations/contacts')->assertUnauthorized();
    }

    public function test_liste_les_personnes_joignables_et_elles_seules(): void
    {
        $agency = Agency::factory()->create();
        $autreAgence = Agency::factory()->create();

        $moi = $this->user('Fatou', 'Diop');
        $this->materializeRoleProfile($moi, 'owner', $agency);

        // Joignables : l'agent de MON agence, et un correspondant d'une conversation passée.
        $agent = $this->user('Moussa', 'Ndiaye');
        $this->materializeRoleProfile($agent, 'agent', $agency);
        $correspondant = $this->user('Awa', 'Sarr');
        $this->shareConversation($moi, $correspondant);

        // Hors d'atteinte : l'agent d'une AUTRE agence, un inconnu, et un autre propriétaire de
        // mon agence — un client de l'agence n'a pas accès à la liste des autres clients.
        $agentAilleurs = $this->user('Ibrahima', 'Fall');
        $this->materializeRoleProfile($agentAilleurs, 'agent', $autreAgence);
        $inconnu = $this->user('Khady', 'Ba');
        $autreProprietaire = $this->user('Omar', 'Gueye');
        $this->materializeRoleProfile($autreProprietaire, 'owner', $agency);

        $this->actingAsApi($moi);

        $attendus = collect([$agent->id, $correspondant->id])->sort()->values()->all();
        $this->assertSame($attendus, $this->contactIds());
        $this->assertNotContains($moi->id, $this->contactIds(), 'on ne s’invite pas soi-même');
        $this->assertNotContains($agentAilleurs->id, $this->contactIds());
        $this->assertNotContains($inconnu->id, $this->contactIds());
        $this->assertNotContains($autreProprietaire->id, $this->contactIds());
    }

    public function test_un_agent_joint_aussi_les_proprietaires_de_son_agence(): void
    {
        $agency = Agency::factory()->create();

        $agent = $this->user('Moussa', 'Ndiaye');
        $this->materializeRoleProfile($agent, 'agent', $agency);
        $proprietaire = $this->user('Fatou', 'Diop');
        $this->materializeRoleProfile($proprietaire, 'owner', $agency);

        $this->actingAsApi($agent);

        $this->assertSame([$proprietaire->id], $this->contactIds());
    }

    public function test_ne_rend_que_le_nom_et_l_avatar_jamais_les_coordonnees(): void
    {
        $moi = $this->user('Fatou', 'Diop');
        $correspondant = User::factory()->create([
            'first_name' => 'Awa',
            'last_name' => 'Sarr',
            'email' => 'awa.sarr@example.test',
            'phone' => '+221770000001',
        ]);
        $this->shareConversation($moi, $correspondant);

        $this->actingAsApi($moi);

        // Réparation 2 : demander l'e-mail ou le téléphone par `fields[users]` est désormais REFUSÉ
        // (400) — la liste blanche de l'endpoint ne porte que le nom.
        $this->getJson('/api/conversations/contacts?fields[users]=id,first_name,last_name,email,phone')
            ->assertStatus(400);

        $response = $this->getJson('/api/conversations/contacts?fields[users]=id,first_name,last_name')
            ->assertOk()
            ->assertJsonPath('data.0.id', $correspondant->id)
            ->assertJsonPath('data.0.name', 'Awa Sarr');

        $this->assertSame(['avatar_url', 'id', 'name'], collect($response->json('data.0'))->keys()->sort()->values()->all());
        $this->assertStringNotContainsString('awa.sarr@example.test', $response->getContent());
        $this->assertStringNotContainsString('770000001', $response->getContent());
    }

    public function test_la_recherche_par_nom_reste_dans_le_perimetre(): void
    {
        $moi = $this->user('Zulqarnayn', 'Wxyzptlk');
        $awa = $this->user('Awa', 'Sarr');
        $autreAwa = $this->user('Awa', 'Sarr'); // homonyme, sans aucune relation
        $moussa = $this->user('Moussa', 'Ndiaye');
        $this->shareConversation($moi, $awa);
        $this->shareConversation($moi, $moussa);
        $this->indexSearchable(User::class);

        $this->actingAsApi($moi);

        $this->assertSame([$awa->id], $this->contactIds('?filter[search]=Awa'));
        $this->assertNotContains($autreAwa->id, $this->contactIds('?filter[search]=Awa'));
    }

    /**
     * Réparation 2 (relevé du vérificateur, 2026-09-23) : `filter[search]` interrogeait aussi
     * l'e-mail, l'identifiant et le téléphone (`User::$requestSearchFields`). La ressource n'en
     * rendait rien, mais la LISTE répondait — un oracle : chercher un fragment d'adresse renvoyait
     * « Awa Sarr ». Chaque recherche ci-dessous porte un jeton qui n'apparaît QUE dans la
     * coordonnée visée, jamais dans un nom : un résultat ne peut venir que de la coordonnée.
     */
    public function test_la_recherche_ne_porte_que_sur_le_nom(): void
    {
        $moi = $this->user('Fatou', 'Diop');
        $awa = User::factory()->create([
            'first_name' => 'Awa',
            'last_name' => 'Sarr',
            'email' => 'zzsecretqx@example.test',
            'username' => 'qqpseudozz',
            'phone' => '+221774455667',
        ]);
        $this->shareConversation($moi, $awa);
        $this->indexSearchable(User::class);

        $this->actingAsApi($moi);

        // Témoin : le nom, lui, trouve — sans quoi les refus ci-dessous ne prouveraient rien.
        $this->assertSame([$awa->id], $this->contactIds('?filter[search]=Sarr'));

        foreach (['zzsecretqx', 'qqpseudozz', '774455667'] as $coordonnee) {
            $this->assertSame([], $this->contactIds('?filter[search]='.$coordonnee), $coordonnee);
        }
    }

    /**
     * Les autres paramètres de `User::buildQuery()` — tri par e-mail, filtres d'administration,
     * relations de profil — posent des questions sur un COMPTE, pas sur un contact. L'endpoint ne
     * les connaît pas : 400, comme tout paramètre hors de sa liste blanche.
     */
    public function test_les_parametres_d_administration_sont_refuses(): void
    {
        $moi = $this->user('Fatou', 'Diop');
        $this->shareConversation($moi, $this->user('Awa', 'Sarr'));

        $this->actingAsApi($moi);

        foreach ([
            'sort=email', 'sort=-status', 'sort=created_at',
            'filter[status]=active', 'filter[added_by_id]=1', 'filter[role]=agent',
            'include=agentProfiles', 'fields[users]=phone',
        ] as $parametre) {
            $this->assertSame(400, $this->getJson('/api/conversations/contacts?'.$parametre)->status(), $parametre);
        }

        // Ce que le sélecteur demande, lui, passe : le nom, dans les deux sens.
        $this->getJson('/api/conversations/contacts?sort=-last_name')->assertOk();
        $this->getJson('/api/conversations/contacts?sort=first_name&fields[users]=id,first_name,last_name')->assertOk();
    }

    public function test_la_liste_est_paginee_dans_la_forme_canonique(): void
    {
        $moi = $this->user('Fatou', 'Diop');
        foreach (['Awa', 'Binta', 'Coumba'] as $prenom) {
            $this->shareConversation($moi, $this->user($prenom, 'Sarr'));
        }

        $this->actingAsApi($moi);

        $this->getJson('/api/conversations/contacts?per_page=2')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.total', 3)
            ->assertJsonPath('meta.per_page', 2)
            ->assertJsonPath('meta.last_page', 2)
            // Tri par défaut alphabétique : c'est une liste de personnes, pas un fil d'activité.
            ->assertJsonPath('data.0.name', 'Awa Sarr')
            ->assertJsonPath('data.1.name', 'Binta Sarr');
    }

    // ---------------------------------------------------------------------------------------------
    // Réparation 1 (relevé du vérificateur, 2026-09-23) : chaque branche de `MessagingReach` a son
    // test. Avant, la règle CRM et « l'administrateur d'agence est de l'équipe » survivaient à
    // leur suppression (37 et 33 tests verts).
    // ---------------------------------------------------------------------------------------------

    private function rattacher(User $user, Customer $fiche, RelationshipType $type): void
    {
        UserCustomerRelationship::create([
            'user_id' => $user->id,
            'customer_id' => $fiche->id,
            'relationship_type' => $type->value,
        ]);
    }

    public function test_le_lien_crm_rend_joignable_dans_ses_trois_sens(): void
    {
        $moi = $this->user('Fatou', 'Diop');

        // a. une même fiche rattachée à mon compte et à celui d'un agent ;
        $ficheCommune = Customer::factory()->create();
        $agent = $this->user('Moussa', 'Ndiaye');
        $this->rattacher($moi, $ficheCommune, RelationshipType::OwnerTenant);
        $this->rattacher($agent, $ficheCommune, RelationshipType::AgentClient);

        // b. le compte du client d'une fiche à laquelle je suis rattachée ;
        $locataire = $this->user('Awa', 'Sarr');
        $this->rattacher($moi, Customer::factory()->create(['user_id' => $locataire->id]), RelationshipType::OwnerTenant);

        // Hors d'atteinte : une fiche où je ne figure pas, et son client.
        $etranger = $this->user('Khady', 'Ba');
        $clientEtranger = $this->user('Omar', 'Gueye');
        $this->rattacher($etranger, Customer::factory()->create(['user_id' => $clientEtranger->id]), RelationshipType::AgentClient);

        $this->actingAsApi($moi);

        $this->assertSame(collect([$agent->id, $locataire->id])->sort()->values()->all(), $this->contactIds());

        // c. en retour : le locataire joint celle qui est rattachée à SA fiche.
        $this->actingAsApi($locataire);
        $this->assertSame([$moi->id], $this->contactIds());
    }

    public function test_un_administrateur_d_agence_est_de_l_equipe_et_joint_les_proprietaires(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->user('Moussa', 'Ndiaye');
        $this->materializeRoleProfile($admin, 'agency_admin', $agency);
        $proprietaire = $this->user('Fatou', 'Diop');
        $this->materializeRoleProfile($proprietaire, 'owner', $agency);

        $this->actingAsApi($admin);
        $this->assertSame([$proprietaire->id], $this->contactIds(), 'l’équipe voit les propriétaires');

        // Et le propriétaire voit l'administrateur : il est de l'équipe.
        $this->actingAsApi($proprietaire);
        $this->assertSame([$admin->id], $this->contactIds());
    }

    public function test_un_profil_d_agent_non_actif_n_est_pas_de_l_equipe(): void
    {
        $agency = Agency::factory()->create();
        $moi = $this->user('Fatou', 'Diop');
        $this->materializeRoleProfile($moi, 'owner', $agency);

        $actif = $this->user('Moussa', 'Ndiaye');
        $this->materializeRoleProfile($actif, 'agent', $agency);
        foreach ([AgentProfileStatus::Draft, AgentProfileStatus::Suspended, AgentProfileStatus::Inactive] as $statut) {
            $agent = $this->user('Agent', ucfirst($statut->value));
            AgentProfile::query()->create(['user_id' => $agent->id, 'agency_id' => $agency->id, 'status' => $statut->value]);
        }

        $this->actingAsApi($moi);

        $this->assertSame([$actif->id], $this->contactIds(), 'une invitation en attente ou un agent suspendu ne sont pas de l’équipe');
    }

    /**
     * Réparation 2 : la branche « propriétaires ACTIFS de l'agence, pour l'équipe » n'avait aucun
     * test — retirer `->active()` laissait 52 tests verts (relevé du vérificateur). Un profil
     * `draft` est une invitation pas encore acceptée ; `inactive` et `blocked` ne sont plus des
     * clients de l'agence.
     */
    public function test_un_proprietaire_non_actif_n_est_pas_joignable_par_l_equipe(): void
    {
        $agency = Agency::factory()->create();
        $agent = $this->user('Moussa', 'Ndiaye');
        $this->materializeRoleProfile($agent, 'agent', $agency);

        $actif = $this->user('Fatou', 'Diop');
        $this->materializeRoleProfile($actif, 'owner', $agency);
        $horsJeu = [];
        foreach ([OwnerProfileStatus::Draft, OwnerProfileStatus::Inactive, OwnerProfileStatus::Blocked] as $statut) {
            $proprietaire = $this->user('Proprietaire', ucfirst($statut->value));
            OwnerProfile::query()->create(['user_id' => $proprietaire->id, 'agency_id' => $agency->id, 'status' => $statut->value]);
            $horsJeu[] = $proprietaire;
        }

        $this->actingAsApi($agent);

        $this->assertSame([$actif->id], $this->contactIds());

        // Et la création l'applique : la liste et le serveur lisent la même règle.
        foreach ($horsJeu as $proprietaire) {
            $this->postJson('/api/conversations', [
                'type' => 'group',
                'subject' => 'Propriétaires',
                'participants' => [$actif->id, $proprietaire->id],
            ])->assertUnprocessable()->assertJsonValidationErrors(['participants']);
        }
        $this->postJson('/api/conversations', ['participants' => [$actif->id]])->assertCreated();
    }

    /**
     * Passe finale (vérificateur, passe 3) — l'autre moitié de la même règle : le statut de
     * l'ACTEUR. Retirer `->active()` dans `MessagingReach::isActiveStaffAt()` laissait 60 tests
     * verts, et un agent suspendu (un collaborateur écarté) listait alors par nom les
     * propriétaires de l'agence, puis les rangeait dans un groupe. Son profil suspendu lui donne
     * toujours une agence (`User::$agency_id` lit tous les profils) : c'est le statut, et lui
     * seul, qui doit le priver de la branche « propriétaires ».
     */
    public function test_un_membre_non_actif_de_l_equipe_ne_joint_pas_les_proprietaires(): void
    {
        $agency = Agency::factory()->create();
        $collegue = $this->user('Moussa', 'Ndiaye');
        $this->materializeRoleProfile($collegue, 'agent', $agency);
        $proprietaire = $this->user('Fatou', 'Diop');
        $this->materializeRoleProfile($proprietaire, 'owner', $agency);

        $actifTemoin = $this->user('Agent', 'Actif');
        $this->materializeRoleProfile($actifTemoin, 'agent', $agency);

        $horsJeu = [];
        foreach ([AgentProfileStatus::Draft, AgentProfileStatus::Suspended, AgentProfileStatus::Inactive] as $statut) {
            $agent = $this->user('Agent', ucfirst($statut->value));
            AgentProfile::query()->create(['user_id' => $agent->id, 'agency_id' => $agency->id, 'status' => $statut->value]);
            $horsJeu["agent {$statut->value}"] = $agent;
        }
        foreach ([AgencyAdminProfileStatus::Suspended, AgencyAdminProfileStatus::Archived] as $statut) {
            $admin = $this->user('Admin', ucfirst($statut->value));
            AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $agency->id, 'status' => $statut->value]);
            $horsJeu["administrateur {$statut->value}"] = $admin;
        }

        $this->indexSearchable(User::class);

        // Témoin : un agent ACTIF de la même agence joint bien le propriétaire, par la liste et
        // par la recherche — sans lui, un `[]` plus bas pourrait venir d'une fixture ou d'un index
        // muets plutôt que de la règle.
        $this->actingAsApi($actifTemoin);
        $this->assertContains($proprietaire->id, $this->contactIds());
        $this->assertSame([$proprietaire->id], $this->contactIds('?filter[search]=Fatou'));

        foreach ($horsJeu as $cas => $acteur) {
            $this->assertSame($agency->id, $acteur->fresh()->agency_id, "{$cas} : la fixture doit garder une agence");
            $this->actingAsApi($acteur);

            $this->assertNotContains($proprietaire->id, $this->contactIds(), "{$cas} : ne liste pas les propriétaires");
            $this->assertSame([], $this->contactIds('?filter[search]=Fatou'), "{$cas} : ni par une recherche par nom");

            // Et la création l'applique : la liste et le serveur lisent la même règle.
            $this->postJson('/api/conversations', [
                'type' => 'group',
                'subject' => 'Propriétaires',
                'participants' => [$collegue->id, $proprietaire->id],
            ])->assertUnprocessable()->assertJsonValidationErrors(['participants']);
        }
    }

    /**
     * TCK-565, défaut ouvert soldé le 2026-09-24 (point Y7 de la vérification) : les tests de la
     * règle ne mesuraient que des RETRAITS de branche. Un ÉLARGISSEMENT — la règle 1 réécrite
     * `->where('cpa.user_id', $actor->id)->orWhereNotNull('cpa.user_id')` — laissait 64/64 verts,
     * et le sélecteur de owner1 passait de 15 à 95 personnes, administrateurs d'autres agences
     * compris.
     *
     * Ce test pose donc autour de l'acteur tout ce qui NE doit PAS le rejoindre : les relations
     * des AUTRES (une conversation entre deux inconnus, le correspondant de mon correspondant, un
     * lien CRM où je ne figure pas) et une autre agence au complet. La liste doit rendre
     * EXACTEMENT mon correspondant, et la création refuser chacun des autres.
     */
    public function test_la_frontiere_ne_s_elargit_pas_aux_relations_des_autres(): void
    {
        $agency = Agency::factory()->create();
        $autreAgence = Agency::factory()->create();

        $moi = $this->user('Fatou', 'Diop');
        $this->materializeRoleProfile($moi, 'owner', $agency);
        $correspondant = $this->user('Awa', 'Sarr');
        $this->shareConversation($moi, $correspondant);

        $horsFrontiere = [];

        // Règle 1 : ni transitive, ni ouverte aux conversations des autres.
        $horsFrontiere['correspondant de mon correspondant'] = $this->user('Coumba', 'Faye');
        $this->shareConversation($correspondant, $horsFrontiere['correspondant de mon correspondant']);
        $horsFrontiere['inconnu A'] = $this->user('Ibrahima', 'Fall');
        $horsFrontiere['inconnu B'] = $this->user('Khady', 'Ba');
        $this->shareConversation($horsFrontiere['inconnu A'], $horsFrontiere['inconnu B']);

        // Règle 2 : un lien CRM entre deux autres comptes, dans ses trois sens.
        $horsFrontiere['agent CRM d’un autre'] = $this->user('Omar', 'Gueye');
        $horsFrontiere['client CRM d’un autre'] = $this->user('Pape', 'Sow');
        $horsFrontiere['co-rattaché d’un autre'] = $this->user('Mame', 'Diouf');
        $ficheEtrangere = Customer::factory()->create(['user_id' => $horsFrontiere['client CRM d’un autre']->id]);
        $this->rattacher($horsFrontiere['agent CRM d’un autre'], $ficheEtrangere, RelationshipType::AgentClient);
        $this->rattacher($horsFrontiere['co-rattaché d’un autre'], $ficheEtrangere, RelationshipType::OwnerTenant);

        // Règle 3 : l'équipe et les propriétaires d'une AUTRE agence, et, dans la mienne, un autre
        // propriétaire (je suis cliente de l'agence, pas de son équipe).
        $horsFrontiere['agent d’une autre agence'] = $this->user('Moussa', 'Ndiaye');
        $this->materializeRoleProfile($horsFrontiere['agent d’une autre agence'], 'agent', $autreAgence);
        $horsFrontiere['administrateur d’une autre agence'] = $this->user('Admin', 'Ailleurs');
        $this->materializeRoleProfile($horsFrontiere['administrateur d’une autre agence'], 'agency_admin', $autreAgence);
        $horsFrontiere['propriétaire d’une autre agence'] = $this->user('Ndeye', 'Sarr');
        $this->materializeRoleProfile($horsFrontiere['propriétaire d’une autre agence'], 'owner', $autreAgence);
        $horsFrontiere['autre propriétaire de mon agence'] = $this->user('Aliou', 'Cisse');
        $this->materializeRoleProfile($horsFrontiere['autre propriétaire de mon agence'], 'owner', $agency);

        $this->actingAsApi($moi);

        $this->assertSame([$correspondant->id], $this->contactIds(), 'la liste rend exactement mon correspondant');
        $this->assertSame(
            array_values(array_map(fn (User $u) => $u->id, $horsFrontiere)),
            app(MessagingReach::class)->outOfReach($moi, array_map(fn (User $u) => $u->id, $horsFrontiere)),
        );

        foreach ($horsFrontiere as $cas => $etranger) {
            $this->postJson('/api/conversations', [
                'type' => 'group',
                'subject' => 'Frontière',
                'participants' => [$correspondant->id, $etranger->id],
            ])->assertUnprocessable()->assertJsonValidationErrors(['participants']);
        }

        // Témoin : le même corps avec deux personnes joignables passe — sans lui, les 422
        // ci-dessus pourraient venir d'autre chose que de la règle.
        $collegue = $this->user('Agent', 'Temoin');
        $this->materializeRoleProfile($collegue, 'agent', $agency);
        $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Frontière',
            'participants' => [$correspondant->id, $collegue->id],
        ])->assertCreated();
    }

    /**
     * Même frontière, vue de l'ÉQUIPE : un agent joint les propriétaires de SON agence (règle 3),
     * jamais ceux d'une autre. Le test précédent a une propriétaire pour actrice ; sans celui-ci,
     * `ownerProfiles` sans condition d'agence laissait 18/18 verts (mutation W3b, 2026-09-24).
     */
    public function test_l_equipe_ne_joint_pas_les_proprietaires_d_une_autre_agence(): void
    {
        $agency = Agency::factory()->create();
        $autreAgence = Agency::factory()->create();

        $agent = $this->user('Moussa', 'Ndiaye');
        $this->materializeRoleProfile($agent, 'agent', $agency);
        $proprietaire = $this->user('Fatou', 'Diop');
        $this->materializeRoleProfile($proprietaire, 'owner', $agency);
        $proprietaireAilleurs = $this->user('Ndeye', 'Sarr');
        $this->materializeRoleProfile($proprietaireAilleurs, 'owner', $autreAgence);

        $this->actingAsApi($agent);

        $this->assertSame([$proprietaire->id], $this->contactIds());
        $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Propriétaires',
            'participants' => [$proprietaire->id, $proprietaireAilleurs->id],
        ])->assertUnprocessable()->assertJsonValidationErrors(['participants']);
    }

    /**
     * TCK-565, défaut ouvert soldé le 2026-09-24 (point Y5) : le docblock de `MessagingReach`
     * promet « jamais un compte supprimé », et un compte supprimé RESTE dans
     * `conversation_participants`. `User::query()->withTrashed()` laissait pourtant 64/64 verts.
     * On couvre les deux chemins par lesquels un compte supprimé serait joignable : un ancien
     * correspondant (règle 1) et un collègue de l'agence (règle 3).
     */
    public function test_un_compte_supprime_n_est_ni_liste_ni_accepte(): void
    {
        $agency = Agency::factory()->create();

        $moi = $this->user('Fatou', 'Diop');
        $this->materializeRoleProfile($moi, 'agent', $agency);
        $correspondant = $this->user('Awa', 'Sarr');
        $this->shareConversation($moi, $correspondant);
        $collegue = $this->user('Moussa', 'Ndiaye');
        $this->materializeRoleProfile($collegue, 'agent', $agency);

        $correspondantSupprime = $this->user('Coumba', 'Faye');
        $this->shareConversation($moi, $correspondantSupprime);
        $collegueSupprime = $this->user('Omar', 'Gueye');
        $this->materializeRoleProfile($collegueSupprime, 'agent', $agency);

        $this->actingAsApi($moi);
        // Témoin AVANT suppression : les deux sont bien joignables par la règle.
        $this->assertContains($correspondantSupprime->id, $this->contactIds());
        $this->assertContains($collegueSupprime->id, $this->contactIds());

        $correspondantSupprime->delete();
        $collegueSupprime->delete();
        $this->assertSoftDeleted($correspondantSupprime);

        $this->assertSame(collect([$correspondant->id, $collegue->id])->sort()->values()->all(), $this->contactIds());

        foreach ([$correspondantSupprime, $collegueSupprime] as $supprime) {
            $this->assertSame([$supprime->id], app(MessagingReach::class)->outOfReach($moi, [$correspondant->id, $supprime->id]));
            $this->postJson('/api/conversations', [
                'type' => 'group',
                'subject' => 'Supprimés',
                'participants' => [$correspondant->id, $supprime->id],
            ])->assertUnprocessable()->assertJsonValidationErrors(['participants']);
        }
    }

    // ---------------------------------------------------------------------------------------------
    // `GET /conversations/{conversation}/contacts` — compléter un groupe EXISTANT
    // ---------------------------------------------------------------------------------------------

    /** @return array{0: User, 1: User, 2: Conversation} un groupe dont `$admin` est administrateur */
    private function groupe(): array
    {
        $admin = $this->user('Fatou', 'Diop');
        $membre = $this->user('Awa', 'Sarr');
        $groupe = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Groupe',
            'created_by' => $admin->id,
        ]);
        $groupe->participants()->attach($admin->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);
        $groupe->participants()->attach($membre->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);

        return [$admin, $membre, $groupe];
    }

    /** @return list<int> */
    private function contactIdsPour(Conversation $groupe): array
    {
        $response = $this->getJson("/api/conversations/{$groupe->id}/contacts")->assertOk();

        return collect($response->json('data'))->pluck('id')->map(fn ($id) => (int) $id)->sort()->values()->all();
    }

    public function test_seul_un_administrateur_du_groupe_peut_lister_qui_y_ajouter(): void
    {
        [, $membre, $groupe] = $this->groupe();

        $this->actingAsApi($membre);

        $this->getJson("/api/conversations/{$groupe->id}/contacts")->assertForbidden();
    }

    /**
     * Le défaut relevé par le vérificateur : une personne qui avait quitté le groupe était LISTÉE
     * par le sélecteur puis REFUSÉE par l'ajout (« LISTED-D yes », « READD-D 422 »). Les deux lisent
     * désormais la même règle, avec la même conversation — et la ré-invitation passe.
     */
    public function test_le_selecteur_et_l_ajout_s_accordent_sur_un_ancien_membre(): void
    {
        [$admin, $membre, $groupe] = $this->groupe();
        $parti = $this->user('Moussa', 'Ndiaye');
        $groupe->participants()->attach($parti->id, [
            'role' => ParticipantRole::Member->value,
            'joined_at' => now()->subDay(),
            'left_at' => now(),
        ]);

        $this->actingAsApi($admin);

        $this->assertSame([$parti->id], $this->contactIdsPour($groupe), 'les membres ACTIFS ne sont pas proposés, l’ancien membre oui');
        $this->assertNotContains($membre->id, $this->contactIdsPour($groupe));

        $this->postJson("/api/conversations/{$groupe->id}/participants", ['user_ids' => [$parti->id]])->assertCreated();
    }

    /**
     * L'autre sens du même accord : l'ajout acceptait l'équipe de l'agence du bien de la
     * conversation, que le sélecteur ne montrait pas. Il la montre, et elle seule.
     */
    public function test_l_equipe_de_l_agence_du_bien_est_proposee_et_acceptee(): void
    {
        [$admin, $membre, $groupe] = $this->groupe();
        $agency = Agency::factory()->create();
        $groupe->update(['property_id' => Property::factory()->create(['agency_id' => $agency->id])->id]);
        $agent = $this->user('Moussa', 'Ndiaye');
        $this->materializeRoleProfile($agent, 'agent', $agency);
        $clientDeLAgence = $this->user('Omar', 'Gueye');
        $this->materializeRoleProfile($clientDeLAgence, 'owner', $agency);

        $this->actingAsApi($admin);

        $this->assertSame([$agent->id], $this->contactIdsPour($groupe));
        // Pour un NOUVEAU groupe, cet agent n'est pas joignable : c'est bien la règle 4 qui l'ouvre.
        $this->assertSame([$membre->id], $this->contactIds());

        $this->postJson("/api/conversations/{$groupe->id}/participants", ['user_ids' => [$agent->id]])->assertCreated();
        $this->postJson("/api/conversations/{$groupe->id}/participants", ['user_ids' => [$clientDeLAgence->id]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['user_ids']);
    }
}

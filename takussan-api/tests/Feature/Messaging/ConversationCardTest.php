<?php

namespace Tests\Feature\Messaging;

use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MessageType;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Message;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Messaging\CodesDuFil;
use App\Services\Messaging\SujetsDuFil;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2964 (ADR-0128 §§ 3 et 4) — poser un objet dans un fil : `POST /api/conversations/{c}/cards`
 * `{object: {type, id}}`.
 *
 *  - le serveur pose `type = card`, `code`, `data` et `content` ; rien d'autre du client n'est lu (AC3) ;
 *  - seuls les types POSABLES du registre (`property`, `property_visit`) passent ; tout autre, même du
 *    registre, rend 422 (AC4) ;
 *  - l'auteur écrit dans le fil ET lit l'objet qu'il pose ; sinon 403, sans message (AC2) ;
 *  - le bien se relit pour chaque lecteur : publié, il se lit de tous (sous-ensemble de sa fiche
 *    publique) ; dépublié, il devient indisponible pour le client et reste lu de l'agent (AC1) ;
 *  - la carte suit le chemin ordinaire : non lue pour l'autre, notifiée par un extrait LISIBLE dans la
 *    langue du destinataire (jamais le code brut).
 *
 * Le fil est une directe agent ↔ client, sans contexte : son accès ne dépend que de la participation.
 */
class ConversationCardTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $client;

    private Customer $fiche;

    private Conversation $fil;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->agent = $this->agentOf($this->agency, ['preferred_language' => 'fr']);
        $this->client = User::factory()->create(['preferred_language' => 'en']);
        $this->fiche = Customer::factory()->create(['user_id' => $this->client->id, 'agency_id' => $this->agency->id]);
        $this->fil = $this->directe($this->agent, $this->client);
    }

    private function directe(User $a, User $b, ConversationStatus $status = ConversationStatus::Active): Conversation
    {
        $fil = Conversation::create([
            'type' => ConversationType::Direct->value,
            'status' => $status->value,
            'created_by' => $a->id,
        ]);
        $fil->participants()->attach([
            $a->id => ['joined_at' => now()],
            $b->id => ['joined_at' => now()],
        ]);

        return $fil;
    }

    private function bien(array $attributs = []): Property
    {
        return Property::factory()->create(array_merge([
            'agency_id' => $this->agency->id,
            'title' => 'Appartement 3 chambres, Mermoz',
            'price' => 650000,
        ], $attributs));
    }

    private function poser(Conversation $fil, array $corps)
    {
        return $this->postJson("/api/conversations/{$fil->id}/cards", $corps);
    }

    /** @return array<string, mixed> l'objet de la seule carte du fil, tel que `GET …/messages` le rend à `$lecteur` */
    private function objetLuPar(User $lecteur): array
    {
        Sanctum::actingAs($lecteur);
        $carte = collect($this->getJson("/api/conversations/{$this->fil->id}/messages")->assertOk()->json('data'))
            ->firstWhere('type', MessageType::Card->value);
        $this->assertNotNull($carte, 'la carte n\'est pas dans la page');

        return $carte['object'];
    }

    public function test_l_agent_partage_un_bien_publie_que_le_client_relit_comme_sa_fiche_publique(): void
    {
        $bien = $this->bien();
        Sanctum::actingAs($this->agent);

        $reponse = $this->poser($this->fil, ['object' => ['type' => 'property', 'id' => $bien->id]])
            ->assertCreated()
            ->assertJsonPath('data.type', 'card')
            ->assertJsonPath('data.metadata.code', 'property.shared')
            ->assertJsonPath('data.metadata.object', ['type' => 'property', 'id' => $bien->id])
            ->assertJsonPath('data.object.id', $bien->id)
            ->assertJsonPath('data.object.title', 'Appartement 3 chambres, Mermoz')
            // L'agent lit le bien par `view` : rien à demander.
            ->assertJsonPath('data.object.abilities.request_visit', false);
        $this->assertSame([], $reponse->json('data.metadata.data'));

        $ligne = Message::query()->sole();
        $this->assertSame('property.shared', $ligne->content);
        $this->assertSame(MessageType::Card, $ligne->type);
        $this->assertSame($this->agent->id, $ligne->sender_id);
        // L'aperçu commun de la liste reste le code (le front écrit le libellé).
        $this->assertSame('property.shared', $this->fil->fresh()->last_message_preview);

        // Le client lit le bien parce qu'il est publié : « Demander une visite » lui est offert.
        $objet = $this->objetLuPar($this->client);
        $this->assertSame($bien->id, $objet['id']);
        $this->assertTrue($objet['abilities']['request_visit']);
        $this->assertSame(650000.0, (float) $objet['price']);

        // La projection est un sous-ensemble de la fiche publique (hors `abilities`, les gestes du lecteur).
        $public = $this->getJson("/api/public/properties/{$bien->slug}")->assertOk()->json('data');
        foreach ($objet as $cle => $valeur) {
            if ($cle === 'abilities') {
                continue;
            }
            $this->assertArrayHasKey($cle, $public, "clé « {$cle} » absente de la fiche publique");
            if (is_array($valeur)) {
                foreach ($valeur as $sous => $v) {
                    $this->assertSame($public[$cle][$sous] ?? null, $v, "{$cle}.{$sous}");
                }
            } else {
                $this->assertEquals($public[$cle], $valeur, $cle);
            }
        }
    }

    public function test_l_agent_propose_un_creneau_de_visite_qui_se_relit_pour_le_client(): void
    {
        $bien = $this->bien();
        $visite = PropertyVisit::factory()->create([
            'property_id' => $bien->id,
            'visitor_id' => $this->client->id,
            'customer_id' => $this->fiche->id,
            'agent_id' => $this->agent->id,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => now()->addDays(3)->setTime(10, 0),
        ]);
        Sanctum::actingAs($this->agent);

        $this->poser($this->fil, ['object' => ['type' => 'property_visit', 'id' => $visite->id]])
            ->assertCreated()
            ->assertJsonPath('data.metadata.code', 'visit.proposed')
            ->assertJsonPath('data.metadata.data.scheduled_at', $visite->scheduled_at->toIso8601String())
            ->assertJsonPath('data.object.id', $visite->id)
            ->assertJsonPath('data.object.status', 'confirmed');

        $objet = $this->objetLuPar($this->client);
        $this->assertSame($visite->id, $objet['id']);
        $this->assertSame('confirmed', $objet['status']);
    }

    /** AC2 — on ne partage pas un objet qu'on ne lit pas. */
    public function test_un_auteur_qui_ne_lit_pas_l_objet_est_refuse_sans_message(): void
    {
        $ailleurs = Agency::factory()->create();
        $bienPrive = Property::factory()->create(['agency_id' => $ailleurs->id, 'published_at' => null]);
        $visiteAilleurs = PropertyVisit::factory()->create(['property_id' => $bienPrive->id]);
        Sanctum::actingAs($this->agent);

        $this->poser($this->fil, ['object' => ['type' => 'property', 'id' => $bienPrive->id]])->assertForbidden();
        $this->poser($this->fil, ['object' => ['type' => 'property_visit', 'id' => $visiteAilleurs->id]])->assertForbidden();
        // Un objet absent reçoit le même refus qu'un objet d'un tiers : la route ne dit pas ce qui existe.
        $this->poser($this->fil, ['object' => ['type' => 'property', 'id' => 999999]])->assertForbidden();

        $this->assertSame(0, Message::query()->count());
    }

    public function test_un_auteur_en_lecture_seule_ou_hors_du_fil_est_refuse(): void
    {
        $bien = $this->bien();
        $ferme = $this->directe($this->agent, User::factory()->create(), ConversationStatus::Closed);
        Sanctum::actingAs($this->agent);
        $this->poser($ferme, ['object' => ['type' => 'property', 'id' => $bien->id]])->assertForbidden();

        $collegue = $this->agentOf($this->agency);
        Sanctum::actingAs($collegue);
        $this->poser($this->fil, ['object' => ['type' => 'property', 'id' => $bien->id]])->assertForbidden();

        $this->assertSame(0, Message::query()->count());
    }

    /** AC4 — un type du registre qui n'est pas posable, un type hors registre, une forme fausse : 422. */
    public function test_un_type_non_posable_ou_hors_registre_est_refuse_422(): void
    {
        $bien = $this->bien();
        $bail = Lease::factory()->create([
            'property_id' => $bien->id,
            'tenant_id' => $this->fiche->id,
            'agency_id' => $this->agency->id,
            'agent_id' => $this->agent->id,
            'status' => LeaseStatus::Active,
        ]);
        $echeance = LeasePayment::factory()->create(['lease_id' => $bail->id, 'payer_id' => $this->fiche->id]);
        Sanctum::actingAs($this->agent);

        foreach ([
            ['type' => 'lease_payment', 'id' => $echeance->id],
            ['type' => 'lease', 'id' => $bail->id],
            ['type' => 'user', 'id' => $this->client->id],
            ['type' => 'App\\Models\\Property', 'id' => $bien->id],
            ['type' => 'property', 'id' => 'abc'],
            ['type' => 'property'],
        ] as $objet) {
            $this->poser($this->fil, ['object' => $objet])->assertUnprocessable();
        }
        $this->poser($this->fil, [])->assertUnprocessable()->assertJsonValidationErrors(['object']);

        $this->assertSame(0, Message::query()->count());
    }

    /** AC3 — `code`, `data`, `content` et `type` sont ceux du serveur, quoi qu'envoie le client. */
    public function test_les_champs_envoyes_par_le_client_sont_ignores(): void
    {
        $bien = $this->bien();
        Sanctum::actingAs($this->agent);

        $this->poser($this->fil, [
            'object' => ['type' => 'property', 'id' => $bien->id, 'title' => 'Faux titre'],
            'type' => 'text',
            'code' => 'visit.proposed',
            'data' => ['amount' => 1],
            'content' => 'texte',
            'metadata' => ['code' => 'lease_payment.paid'],
        ])->assertCreated();

        $ligne = Message::query()->sole();
        $this->assertSame(MessageType::Card, $ligne->type);
        $this->assertSame('property.shared', $ligne->content);
        // `jsonb` réordonne les clés : l'égalité porte sur le contenu, pas sur l'ordre.
        $this->assertEquals([
            'object' => ['type' => 'property', 'id' => $bien->id],
            'code' => 'property.shared',
            'data' => [],
        ], $ligne->metadata);
    }

    /** AC1 — un bien dépublié après le partage devient indisponible pour le client, sans rien réécrire. */
    public function test_un_bien_depublie_devient_indisponible_pour_le_client_et_reste_lu_de_l_agent(): void
    {
        $bien = $this->bien();
        Sanctum::actingAs($this->agent);
        $this->poser($this->fil, ['object' => ['type' => 'property', 'id' => $bien->id]])->assertCreated();
        $this->assertSame($bien->id, $this->objetLuPar($this->client)['id']);

        $bien->forceFill(['published_at' => null])->save();

        $this->assertSame(['indisponible' => true], $this->objetLuPar($this->client));
        $agent = $this->objetLuPar($this->agent);
        $this->assertSame($bien->id, $agent['id']);
        $this->assertSame('Appartement 3 chambres, Mermoz', $agent['title']);
    }

    /** Un brouillon publié par erreur n'est pas « public » : la règle de la fiche publique (`show`). */
    public function test_un_brouillon_n_est_pas_lu_en_public(): void
    {
        $bien = $this->bien();
        Sanctum::actingAs($this->agent);
        $this->poser($this->fil, ['object' => ['type' => 'property', 'id' => $bien->id]])->assertCreated();

        $bien->forceFill(['status' => 'draft'])->save();

        $this->assertSame(['indisponible' => true], $this->objetLuPar($this->client));
    }

    public function test_la_carte_est_non_lue_pour_l_autre_et_notifiee_dans_sa_langue(): void
    {
        $bien = $this->bien();
        Sanctum::actingAs($this->agent);
        $this->poser($this->fil, ['object' => ['type' => 'property', 'id' => $bien->id]])->assertCreated();

        // Le client (anglais) reçoit un extrait lisible dans SA langue, jamais le code brut.
        $avis = AppNotification::query()->where('user_id', $this->client->id)->sole();
        $this->assertSame(__('messaging.card_preview.property_shared', [], 'en'), $avis->params['excerpt']);
        $this->assertNotSame('property.shared', $avis->params['excerpt']);
        $this->assertNotSame(
            __('messaging.card_preview.property_shared', [], 'en'),
            __('messaging.card_preview.property_shared', [], 'fr'),
        );
        $this->assertSame(0, AppNotification::query()->where('user_id', $this->agent->id)->count());

        Sanctum::actingAs($this->client);
        $ligne = collect($this->getJson('/api/conversations')->assertOk()->json('data'))->firstWhere('id', $this->fil->id);
        $this->assertSame(1, $ligne['unread_count']);
    }

    /** Les types posables, et la seule carte de chacun (le code de la pose se dérive du catalogue). */
    public function test_les_types_posables_et_leur_carte(): void
    {
        $this->assertEqualsCanonicalizing(['property', 'property_visit'], SujetsDuFil::typesPosables());
        $this->assertSame('property.shared', CodesDuFil::carteDePose('property'));
        $this->assertSame('visit.proposed', CodesDuFil::carteDePose('property_visit'));
        foreach (SujetsDuFil::typesPosables() as $type) {
            $this->assertSame(CodesDuFil::NATURE_CARTE, CodesDuFil::entree(CodesDuFil::carteDePose($type))['nature']);
        }
    }

    /**
     * Le parcours réel de « Proposer un créneau » dans une directe SANS bien : la fiche du client se lit
     * dans `…/context` (personnel seul), la visite naît par SA route (confirmée, pour cette fiche), puis
     * sa carte est posée et relue par le client.
     */
    public function test_proposer_un_creneau_par_les_routes_reelles_dans_une_directe(): void
    {
        $bien = $this->bien();
        Sanctum::actingAs($this->agent);

        $this->getJson("/api/conversations/{$this->fil->id}/context")
            ->assertOk()
            ->assertJsonPath('data.customer.id', $this->fiche->id);

        $visite = $this->postJson('/api/property-visits', [
            'property_id' => $bien->id,
            'customer_id' => $this->fiche->id,
            'scheduled_at' => now()->addDays(4)->setTime(10, 0)->toIso8601String(),
        ])->assertCreated()
            ->assertJsonPath('data.status', 'confirmed')
            ->assertJsonPath('data.customer_id', $this->fiche->id)
            ->json('data');

        $this->poser($this->fil, ['object' => ['type' => 'property_visit', 'id' => $visite['id']]])
            ->assertCreated()
            ->assertJsonPath('data.metadata.code', 'visit.proposed');

        $objet = $this->objetLuPar($this->client);
        $this->assertSame($visite['id'], $objet['id']);
        $this->assertSame('confirmed', $objet['status']);
    }
}

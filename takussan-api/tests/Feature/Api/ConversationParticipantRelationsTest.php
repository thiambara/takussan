<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Enums\ConversationType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceCategory;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2748 (AC3) — `GET /api/conversations/{id}/context` rend `participants` : la RELATION de chaque
 * participant actuel au contexte du fil (`locataire`, `prestataire`, `proprietaire`, `agent`),
 * dérivée du bail, de l'intervention et du bien — jamais stockée.
 *
 * Chaque relation ne se lit que si l'appelant peut lire l'objet DONT ELLE VIENT : le locataire, si
 * `LeasePolicy::view` sur CE bail ; le prestataire, si `MaintenanceRequestPolicy::view` ; le
 * propriétaire, par le bail lisible ou par le bien lisible (`PropertyPolicy::view` — pas le bloc
 * `property` du contexte, rendu à tout participant) ; l'agent, le personnel actif de l'agence d'un
 * objet lisible. Sans objet lisible, la liste est vide : aucune relation devinée.
 */
class ConversationParticipantRelationsTest extends TestCase
{
    use MaintenanceActors;
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $bailleur;

    private User $locataire;

    private User $prestataire;

    private Property $bien;

    private Lease $bail;

    private MaintenanceRequest $intervention;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->agent = $this->agentOf($this->agency);
        $this->bailleur = $this->landlordOf($this->agency);
        $this->bien = Property::factory()->create(['user_id' => $this->bailleur->id, 'agency_id' => $this->agency->id]);
        $this->locataire = User::factory()->create();
        $this->bail = Lease::factory()->create([
            'property_id' => $this->bien->id,
            'agency_id' => $this->agency->id,
            'tenant_id' => Customer::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->locataire->id])->id,
            'landlord_id' => $this->bailleur->id,
            'status' => LeaseStatus::Active,
        ]);
        $this->prestataire = $this->providerFor($this->agency);
        $this->intervention = MaintenanceRequest::factory()->create([
            'property_id' => $this->bien->id,
            'lease_id' => $this->bail->id,
            'requester_id' => $this->locataire->id,
            'assigned_to' => $this->prestataire->id,
            'category' => MaintenanceCategory::Plumbing,
            'status' => MaintenanceStatus::Assigned,
        ]);
    }

    /** @param  list<User>  $membres */
    private function groupe(array $membres, array $attributs = []): Conversation
    {
        $fil = Conversation::factory()->create([
            'type' => ConversationType::Group,
            'subject' => 'Fuite sous évier',
            'created_by' => $membres[0]->id,
            ...$attributs,
        ]);
        foreach ($membres as $membre) {
            $fil->participants()->attach($membre->id, ['joined_at' => now()]);
        }

        return $fil;
    }

    private function contexte(Conversation $fil, User $lecteur): TestResponse
    {
        Sanctum::actingAs($lecteur);

        return $this->getJson("/api/conversations/{$fil->id}/context")->assertOk();
    }

    /** @return array<int, array<string, mixed>> */
    private function relations(TestResponse $reponse): array
    {
        $parId = [];
        foreach ($reponse->json('data.participants') ?? [] as $ligne) {
            $parId[(int) $ligne['user_id']] = $ligne;
        }

        return $parId;
    }

    public function test_l_agent_lit_la_relation_de_chaque_participant(): void
    {
        $fil = $this->groupe([$this->agent, $this->locataire, $this->prestataire, $this->bailleur], ['maintenance_request_id' => $this->intervention->id]);

        $relations = $this->relations($this->contexte($fil, $this->agent));

        $this->assertSame('locataire', $relations[$this->locataire->id]['relation']);
        $this->assertSame('prestataire', $relations[$this->prestataire->id]['relation']);
        $this->assertSame('plumbing', $relations[$this->prestataire->id]['category']);
        $this->assertSame('proprietaire', $relations[$this->bailleur->id]['relation']);
        $this->assertSame('agent', $relations[$this->agent->id]['relation']);
        // La catégorie n'appartient qu'au prestataire.
        $this->assertArrayNotHasKey('category', $relations[$this->locataire->id]);
    }

    /** Le locataire vient du bail de l'intervention : un prestataire, qui ne lit pas le bail, ne l'apprend pas. */
    public function test_le_prestataire_ne_lit_pas_qui_est_locataire(): void
    {
        $fil = $this->groupe([$this->agent, $this->locataire, $this->prestataire, $this->bailleur], ['maintenance_request_id' => $this->intervention->id]);

        $relations = $this->relations($this->contexte($fil, $this->prestataire));

        $this->assertSame('prestataire', $relations[$this->prestataire->id]['relation']);
        $this->assertSame('agent', $relations[$this->agent->id]['relation']);
        $this->assertArrayNotHasKey($this->locataire->id, $relations);
        // Ni le bail ni le bien ne lui sont lisibles : le bailleur n'est pas nommé non plus.
        $this->assertArrayNotHasKey($this->bailleur->id, $relations);
    }

    /**
     * Le locataire lit son bail : il apprend qui est le bailleur et l'agent. Le prestataire, membre
     * d'un fil de bail sans intervention, n'a aucune relation au contexte : rien n'est deviné.
     */
    public function test_le_locataire_lit_le_bail_et_rien_n_est_devine(): void
    {
        $fil = $this->groupe([$this->agent, $this->locataire, $this->prestataire, $this->bailleur], ['lease_id' => $this->bail->id]);

        $relations = $this->relations($this->contexte($fil, $this->locataire));

        $this->assertSame('locataire', $relations[$this->locataire->id]['relation']);
        $this->assertSame('proprietaire', $relations[$this->bailleur->id]['relation']);
        $this->assertSame('agent', $relations[$this->agent->id]['relation']);
        $this->assertArrayNotHasKey($this->prestataire->id, $relations);
    }

    /** Le bail DU FIL est jugé : un participant qui ne le lit pas n'apprend pas qui en est locataire. */
    public function test_le_bail_du_fil_n_est_lu_que_par_qui_le_voit(): void
    {
        $inconnu = User::factory()->create();
        $fil = $this->groupe([$this->agent, $this->locataire, $inconnu], ['lease_id' => $this->bail->id]);

        $relations = $this->relations($this->contexte($fil, $inconnu));

        $this->assertArrayNotHasKey($this->locataire->id, $relations);
        $this->assertSame([], $relations);
    }

    /**
     * L'intervention DU FIL : un participant qui ne la lit pas n'entre pas dans le fil
     * (`ConversationAccess`, 403 en amont) — la garde de `RelationsAuFil` sur l'intervention n'est donc
     * pas atteignable par la route, et ce test épingle la raison.
     */
    public function test_l_intervention_du_fil_ferme_le_fil_a_qui_ne_la_voit_pas(): void
    {
        $inconnu = User::factory()->create();
        $fil = $this->groupe([$this->agent, $this->prestataire, $inconnu], ['maintenance_request_id' => $this->intervention->id]);

        Sanctum::actingAs($inconnu);
        $this->getJson("/api/conversations/{$fil->id}/context")->assertForbidden();
    }

    /** Un participant qui ne lit aucun objet du fil : aucune relation, même celle de l'agent. */
    public function test_sans_objet_lisible_aucune_relation(): void
    {
        $inconnu = User::factory()->create();
        $fil = $this->groupe([$this->agent, $inconnu, $this->bailleur], ['property_id' => $this->bien->id]);

        $this->contexte($fil, $inconnu)->assertJsonPath('data.participants', []);
    }

    /** Un groupe sans bien, ni bail, ni intervention : pas d'agence du fil, donc pas même « agent ». */
    public function test_un_groupe_sans_contexte_n_a_aucune_relation(): void
    {
        $collegue = $this->agentOf($this->agency);
        $fil = $this->groupe([$this->agent, $collegue, $this->bailleur]);

        $this->contexte($fil, $this->agent)->assertJsonPath('data.participants', []);
    }

    /**
     * Le bien lisible nomme son bailleur au sens de la policy (`BailleurDuBien`) : l'agent qui a SAISI
     * le bien (`properties.user_id`) n'est pas « propriétaire », il est « agent ».
     */
    public function test_l_agent_createur_du_bien_n_est_pas_proprietaire(): void
    {
        $saisi = Property::factory()->create(['user_id' => $this->agent->id, 'agency_id' => $this->agency->id]);
        $collegue = $this->agentOf($this->agency);
        $fil = $this->groupe([$collegue, $this->agent], ['property_id' => $saisi->id]);

        $relations = $this->relations($this->contexte($fil, $collegue));

        $this->assertSame('agent', $relations[$this->agent->id]['relation']);
    }

    /** Même règle par le bail : `leases.landlord_id` recopie le créateur du bien, l'agent qui l'a saisi. */
    public function test_l_agent_qui_a_saisi_le_bail_n_est_pas_proprietaire(): void
    {
        $saisi = Property::factory()->create(['user_id' => $this->agent->id, 'agency_id' => $this->agency->id]);
        $bail = Lease::factory()->create([
            'property_id' => $saisi->id,
            'agency_id' => $this->agency->id,
            'tenant_id' => Customer::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->locataire->id])->id,
            'landlord_id' => $this->agent->id,
            'status' => LeaseStatus::Active,
        ]);
        $fil = $this->groupe([$this->agent, $this->locataire], ['lease_id' => $bail->id]);

        $relations = $this->relations($this->contexte($fil, $this->locataire));

        $this->assertSame('agent', $relations[$this->agent->id]['relation']);
        $this->assertSame('locataire', $relations[$this->locataire->id]['relation']);
    }

    /** Le bailleur nommé par le bien lisible, sans bail ni intervention. */
    public function test_le_bien_lisible_nomme_son_bailleur(): void
    {
        $fil = $this->groupe([$this->agent, $this->bailleur], ['property_id' => $this->bien->id]);

        $relations = $this->relations($this->contexte($fil, $this->agent));

        $this->assertSame('proprietaire', $relations[$this->bailleur->id]['relation']);
    }

    /** Le personnel d'une AUTRE agence, participant du fil, n'est pas « agent » de celui-ci. */
    public function test_l_agent_d_une_autre_agence_n_est_pas_agent_du_fil(): void
    {
        $ailleurs = $this->agentOf(Agency::factory()->create());
        $fil = $this->groupe([$this->agent, $ailleurs, $this->bailleur], ['property_id' => $this->bien->id]);

        $relations = $this->relations($this->contexte($fil, $this->agent));

        $this->assertArrayNotHasKey($ailleurs->id, $relations);
    }

    /** Un participant parti n'est plus listé. */
    public function test_un_participant_parti_n_a_plus_de_relation(): void
    {
        $fil = $this->groupe([$this->agent, $this->locataire, $this->bailleur], ['lease_id' => $this->bail->id]);
        $fil->participants()->updateExistingPivot($this->locataire->id, ['left_at' => now()]);

        $relations = $this->relations($this->contexte($fil, $this->agent));

        $this->assertArrayNotHasKey($this->locataire->id, $relations);
        $this->assertSame('proprietaire', $relations[$this->bailleur->id]['relation']);
    }

    /** Une personne qui en cumule deux : le prestataire l'emporte, puis le locataire, le bailleur, l'agent. */
    public function test_priorite_quand_une_personne_cumule(): void
    {
        $fil = $this->groupe([$this->agent, $this->bailleur, $this->prestataire], ['maintenance_request_id' => $this->intervention->id]);
        // Le prestataire est aussi locataire d'un bail du bien — lu par l'agent, il reste « prestataire ».
        $this->bail->tenant()->update(['user_id' => $this->prestataire->id]);

        $relations = $this->relations($this->contexte($fil, $this->agent));

        $this->assertSame('prestataire', $relations[$this->prestataire->id]['relation']);
    }
}

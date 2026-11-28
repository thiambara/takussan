<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Enums\ContactLeadChannel;
use App\Models\Enums\ConversationType;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\RelationshipStatus;
use App\Models\Enums\RelationshipType;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2630 — `GET /api/conversations/{conversation}/context` : ce que la colonne de contexte d'un
 * fil affiche — le bien, le bail, l'intervention, et, pour le seul personnel de l'agence du fil sur
 * une directe, la fiche CRM de l'autre participant.
 *
 * (`ConversationContextTest` existe déjà : c'est la recherche de biens et de baux de TCK-576.)
 */
class ConversationThreadContextTest extends TestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $malick;

    private Property $maison;

    private Customer $fiche;

    private PropertyContactLead $demande;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->create(['first_name' => 'Fatou', 'last_name' => 'Sow']);
        $this->materializeRoleProfile($this->agent, 'agent', $this->agency);
        $this->malick = User::factory()->create(['first_name' => 'Malick', 'last_name' => 'Seck']);

        $this->maison = Property::factory()->create([
            'title' => 'Maison avec jardin · Thiès',
            'reference_number' => 'TK-THS-001',
            'price' => 450000,
            'user_id' => $this->agent->id,
            'agency_id' => $this->agency->id,
        ]);

        $this->fiche = Customer::factory()->create([
            'agency_id' => $this->agency->id,
            'user_id' => $this->malick->id,
            'added_by_id' => $this->agent->id,
            'first_name' => 'Malick',
            'last_name' => 'Seck',
            'phone' => '+221771234567',
            'pipeline_stage' => CustomerPipelineStage::Qualified,
        ]);
        UserCustomerRelationship::query()->create([
            'user_id' => $this->agent->id,
            'customer_id' => $this->fiche->id,
            'relationship_type' => RelationshipType::AgentClient,
            'status' => RelationshipStatus::Active,
            'is_primary' => true,
        ]);
    }

    /** @param  list<User>  $membres */
    private function fil(array $membres, array $attributs = []): Conversation
    {
        $fil = Conversation::factory()->create([
            'type' => ConversationType::Direct,
            'subject' => null,
            'created_by' => $membres[1]->id,
            ...$attributs,
        ]);
        foreach ($membres as $membre) {
            $fil->participants()->attach($membre->id, ['joined_at' => now()]);
        }

        return $fil;
    }

    private function contexte(Conversation $fil, User $as)
    {
        Sanctum::actingAs($as);

        return $this->getJson("/api/conversations/{$fil->id}/context");
    }

    /** AC3 — l'agent lit le bien et la fiche du client : étape, téléphone, référent. */
    public function test_l_agent_lit_le_bien_et_la_fiche_du_client(): void
    {
        $fil = $this->fil([$this->agent, $this->malick], ['property_id' => $this->maison->id]);

        $this->contexte($fil, $this->agent)->assertOk()
            ->assertJsonPath('data.property.id', $this->maison->id)
            ->assertJsonPath('data.property.title', 'Maison avec jardin · Thiès')
            ->assertJsonPath('data.property.reference_number', 'TK-THS-001')
            ->assertJsonPath('data.property.slug', $this->maison->slug)
            ->assertJsonPath('data.property.price', 450000)
            ->assertJsonPath('data.property.cover_url', null)
            ->assertJsonPath('data.customer.id', $this->fiche->id)
            ->assertJsonPath('data.customer.full_name', 'Malick Seck')
            ->assertJsonPath('data.customer.stage', 'qualified')
            ->assertJsonPath('data.customer.phone', '+221771234567')
            ->assertJsonPath('data.customer.assigned_agent.id', $this->agent->id)
            ->assertJsonPath('data.customer.assigned_agent.name', 'Fatou Sow')
            ->assertJsonPath('data.lease', null)
            ->assertJsonPath('data.maintenance', null);
    }

    /** AC3 — le client lui-même : le bien, jamais de clé `customer`. */
    public function test_le_client_ne_recoit_jamais_de_cle_customer(): void
    {
        $fil = $this->fil([$this->agent, $this->malick], ['property_id' => $this->maison->id]);

        $this->contexte($fil, $this->malick)->assertOk()
            ->assertJsonPath('data.property.title', 'Maison avec jardin · Thiès')
            ->assertJsonMissingPath('data.customer');
    }

    /** Un bailleur de l'agence, participant d'une directe : pas de fiche CRM non plus. */
    public function test_un_bailleur_ne_recoit_pas_de_cle_customer(): void
    {
        $bailleur = User::factory()->create();
        $this->materializeRoleProfile($bailleur, 'owner', $this->agency);
        $fil = $this->fil([$bailleur, $this->malick]);

        $this->contexte($fil, $bailleur)->assertOk()
            ->assertJsonPath('data.property', null)
            ->assertJsonMissingPath('data.customer');
    }

    /**
     * TCK-2724, AC1 — un collègue qui ne lit pas la fiche dans le CRM (ni auteur, ni référent, ni
     * `crm.view_all` : `GET /api/customers/{id}` → 403) garde le nom de son interlocuteur ; l'étape,
     * le téléphone et le référent lui sont retirés ensemble.
     */
    public function test_sans_lecture_de_la_fiche_le_nom_seul(): void
    {
        $collegue = $this->agentWithout($this->agency, Capability::CrmViewAll);
        Sanctum::actingAs($collegue);
        $this->getJson("/api/customers/{$this->fiche->id}")->assertForbidden();
        $fil = $this->fil([$collegue, $this->malick]);

        $this->contexte($fil, $collegue)->assertOk()
            ->assertJsonPath('data.customer.id', $this->fiche->id)
            ->assertJsonPath('data.customer.full_name', 'Malick Seck')
            ->assertJsonPath('data.customer.stage', null)
            ->assertJsonPath('data.customer.phone', null)
            ->assertJsonPath('data.customer.assigned_agent', null);
    }

    /** TCK-2724, AC2 — l'admin de l'agence, qui lit la fiche : étape, téléphone et référent. */
    public function test_l_admin_lit_l_etape_et_le_referent(): void
    {
        $admin = $this->agencyAdmin($this->agency);
        $fil = $this->fil([$admin, $this->malick]);

        $this->contexte($fil, $admin)->assertOk()
            ->assertJsonPath('data.customer.stage', 'qualified')
            ->assertJsonPath('data.customer.phone', '+221771234567')
            ->assertJsonPath('data.customer.assigned_agent.id', $this->agent->id);
    }

    /**
     * TCK-2724, AC3 — un seul prédicat : pour chaque lecteur du personnel, `stage`, `phone` et
     * `assigned_agent` sont tous trois rendus ou tous trois nuls, et rendus exactement quand le
     * lecteur lit la fiche dans le CRM.
     */
    public function test_un_seul_predicat_pour_les_trois_champs(): void
    {
        $lecteurs = [
            'référent' => $this->agent,
            'admin' => $this->agencyAdmin($this->agency),
            'agent avec crm.view_all' => $this->agentWith($this->agency, Capability::CrmViewAll),
            'agent sans crm.view_all' => $this->agentWithout($this->agency, Capability::CrmViewAll),
        ];

        foreach ($lecteurs as $qui => $lecteur) {
            Sanctum::actingAs($lecteur);
            $litLaFiche = $this->getJson("/api/customers/{$this->fiche->id}")->isOk();
            $fiche = $this->contexte($this->fil([$lecteur, $this->malick]), $lecteur)->assertOk()->json('data.customer');

            $rendus = array_map(fn (string $cle) => $fiche[$cle] !== null, ['stage', 'phone', 'assigned_agent']);
            $this->assertSame([$litLaFiche, $litLaFiche, $litLaFiche], $rendus, $qui);
            $this->assertSame('Malick Seck', $fiche['full_name'], $qui);
        }
    }

    /**
     * Le personnel d'une AUTRE agence ne lit pas la fiche de celle-ci. Sur une directe sans bien ni
     * bail, l'agence du fil est la sienne : il cherche dans SON CRM, où Malick n'a pas de fiche.
     */
    public function test_le_personnel_d_une_autre_agence_ne_lit_pas_la_fiche(): void
    {
        $ailleurs = User::factory()->create();
        $this->materializeRoleProfile($ailleurs, 'agent', Agency::factory()->create());
        $fil = $this->fil([$ailleurs, $this->malick]);

        $reponse = $this->contexte($fil, $ailleurs)->assertOk()->assertJsonPath('data.customer', null);
        $this->assertStringNotContainsString('+221771234567', $reponse->getContent());
    }

    /** L'agence du fil est celle du bien : un fil sur le bien d'une autre agence n'ouvre pas la fiche. */
    public function test_l_agence_du_fil_est_celle_du_bien(): void
    {
        $autreAgence = Agency::factory()->create();
        $bienAilleurs = Property::factory()->create(['agency_id' => $autreAgence->id, 'user_id' => $this->agent->id]);
        $fil = $this->fil([$this->agent, $this->malick], ['property_id' => $bienAilleurs->id, 'created_by' => $this->agent->id]);

        $this->contexte($fil, $this->agent)->assertOk()->assertJsonMissingPath('data.customer');
    }

    /**
     * Un groupe : `customer` vaut null pour le personnel — même réduit à un seul autre membre actuel
     * (Awa l'a quitté) : la fiche est celle d'un tête-à-tête, pas d'un groupe.
     */
    public function test_un_groupe_n_a_pas_de_fiche(): void
    {
        $awa = User::factory()->create();
        $fil = $this->fil([$this->agent, $this->malick, $awa], ['type' => ConversationType::Group, 'subject' => 'Suivi des impayés']);
        $fil->participants()->updateExistingPivot($awa->id, ['left_at' => now()]);

        $this->contexte($fil, $this->agent)->assertOk()
            ->assertJsonPath('data.customer', null)
            ->assertJsonPath('data.property', null);
    }

    /** Une directe avec un inconnu du CRM : `customer` vaut null, la clé est là. */
    public function test_sans_fiche_customer_vaut_null(): void
    {
        $inconnu = User::factory()->create();
        $fil = $this->fil([$this->agent, $inconnu]);

        $this->contexte($fil, $this->agent)->assertOk()->assertJsonPath('data.customer', null);
        $this->assertArrayHasKey('customer', $this->contexte($fil, $this->agent)->json('data'));
    }

    /** Le bail : rendu à qui peut le voir, null pour qui ne le peut pas. */
    public function test_le_bail_suit_la_policy_du_bail(): void
    {
        $locataire = Customer::factory()->create(['agency_id' => $this->agency->id, 'first_name' => 'Awa', 'last_name' => 'Ndiaye']);
        $bail = Lease::factory()->create([
            'property_id' => $this->maison->id,
            'agency_id' => $this->agency->id,
            'landlord_id' => User::factory()->create()->id,
            'tenant_id' => $locataire->id,
            'status' => LeaseStatus::Active,
            'reference_number' => 'LS-THS-0001',
        ]);
        $fil = $this->fil([$this->agent, $this->malick], ['type' => ConversationType::Group, 'subject' => 'Bail', 'lease_id' => $bail->id]);

        $this->contexte($fil, $this->agent)->assertOk()
            ->assertJsonPath('data.lease.id', $bail->id)
            ->assertJsonPath('data.lease.status', 'active')
            ->assertJsonPath('data.lease.reference', 'LS-THS-0001')
            ->assertJsonPath('data.lease.tenant_name', 'Awa Ndiaye');

        // Malick n'est ni bailleur, ni locataire, ni du personnel : le bloc est null, pas un 403.
        $this->contexte($fil, $this->malick)->assertOk()->assertJsonPath('data.lease', null);
    }

    /** L'intervention : rendue à qui peut la voir. */
    public function test_l_intervention_est_rendue(): void
    {
        $demande = MaintenanceRequest::factory()->create([
            'property_id' => $this->maison->id,
            'requester_id' => $this->malick->id,
            'title' => 'Fuite sous l\'évier',
            'scheduled_at' => '2026-11-20 09:30:00',
        ]);
        $fil = $this->fil([$this->agent, $this->malick], ['type' => ConversationType::Group, 'subject' => 'Fuite', 'maintenance_request_id' => $demande->id]);

        $this->contexte($fil, $this->malick)->assertOk()
            ->assertJsonPath('data.maintenance.id', $demande->id)
            ->assertJsonPath('data.maintenance.title', 'Fuite sous l\'évier')
            ->assertJsonPath('data.maintenance.status', $demande->status->value)
            ->assertJsonPath('data.maintenance.scheduled_at', '2026-11-20T09:30:00+00:00');
    }

    /** AC4 — un non-participant : 403, et rien du bien. */
    public function test_un_non_participant_recoit_403_sans_donnee_du_bien(): void
    {
        $fil = $this->fil([$this->agent, $this->malick], ['property_id' => $this->maison->id]);
        $intrus = User::factory()->create();

        $reponse = $this->contexte($fil, $intrus)->assertForbidden();
        $this->assertStringNotContainsString('Thiès', $reponse->getContent());
        $this->assertStringNotContainsString('TK-THS-001', $reponse->getContent());
    }

    /** Un ancien membre d'un groupe : 403, comme `show`. */
    public function test_un_ancien_membre_recoit_403(): void
    {
        $fil = $this->fil([$this->agent, $this->malick], ['type' => ConversationType::Group, 'subject' => 'Suivi']);
        $fil->participants()->updateExistingPivot($this->malick->id, ['left_at' => now()]);

        $this->contexte($fil, $this->malick)->assertForbidden();
    }

    // ── Les faits de la fiche (TCK-2858 ; ex-ConversationContextCustomerFactsTest, TCK-3017) ──────────
    //
    // La fiche de la colonne dit le PROJET du client, sa DERNIÈRE VISITE passée dans l'agence, son PREMIER
    // CONTACT (date et canal) et la DEMANDE DE CONTACT liée — au seul personnel de l'agence du fil, et
    // seulement s'il lit la fiche dans le CRM (`customerReadable`, TCK-2724). Le décor de la classe
    // reçoit, pour ces tests, l'horloge du 15 novembre, la demande du 2 et le projet de la fiche.

    /** La demande qui a créé la fiche (déposée le 2 novembre), la fiche du 3, son projet ; horloge au 15. */
    private function avecLaDemande(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-15 10:00:00', 'UTC'));

        $this->demande = PropertyContactLead::factory()->create([
            'property_id' => $this->maison->id,
            'agency_id' => $this->agency->id,
            'recipient_user_id' => $this->agent->id,
            'channel' => ContactLeadChannel::Form,
        ]);
        $this->demande->forceFill(['created_at' => Carbon::parse('2026-11-02 17:42:00', 'UTC')])->save();

        $this->fiche->forceFill([
            'seeking_contract_type' => 'sale',
            'budget_max' => 70000000,
            'seeking_property_types' => ['house'],
            'seeking_neighborhoods' => ['Thiès Nord'],
            'source_contact_lead_id' => $this->demande->id,
            'created_at' => Carbon::parse('2026-11-03 09:00:00', 'UTC'),
        ])->save();
        $this->demande->forceFill(['customer_id' => $this->fiche->id])->save();
    }

    /** La directe de l'agent et de Malick, sur la maison. */
    private function filDuBien(): Conversation
    {
        return $this->fil([$this->agent, $this->malick], ['created_by' => $this->malick->id, 'property_id' => $this->maison->id]);
    }

    private function faits(Conversation $fil, User $lecteur): TestResponse
    {
        return $this->contexte($fil, $lecteur)->assertOk();
    }

    private function visite(string $quand, VisitStatus $statut, ?Property $bien = null): PropertyVisit
    {
        return PropertyVisit::factory()->create([
            'property_id' => ($bien ?? $this->maison)->id,
            'customer_id' => $this->fiche->id,
            'visitor_id' => $this->malick->id,
            'scheduled_at' => Carbon::parse($quand, 'UTC'),
            'status' => $statut,
        ]);
    }

    /** AC1 — l'agent lit la dernière visite passée, la demande qui a créé la fiche et le premier contact. */
    public function test_l_agent_lit_les_faits_du_client(): void
    {
        $this->avecLaDemande();
        $visiteDu8 = $this->visite('2026-11-08 10:00:00', VisitStatus::Completed);
        $this->visite('2026-11-05 10:00:00', VisitStatus::Completed);
        // Ni une visite annulée, ni une absence, ni une visite à venir ne sont « la dernière visite ».
        $this->visite('2026-11-12 10:00:00', VisitStatus::Cancelled);
        $this->visite('2026-11-13 10:00:00', VisitStatus::NoShow);
        $this->visite('2026-11-20 10:00:00', VisitStatus::Confirmed);

        $this->faits($this->filDuBien(), $this->agent)
            ->assertJsonPath('data.customer.last_visit.id', $visiteDu8->id)
            ->assertJsonPath('data.customer.last_visit.scheduled_at', '2026-11-08T10:00:00+00:00')
            ->assertJsonPath('data.customer.last_visit.property_title', 'Maison avec jardin · Thiès')
            ->assertJsonPath('data.customer.contact_lead.id', $this->demande->id)
            ->assertJsonPath('data.customer.contact_lead.created_at', '2026-11-02T17:42:00+00:00')
            ->assertJsonPath('data.customer.contact_lead.property_title', 'Maison avec jardin · Thiès')
            ->assertJsonPath('data.customer.first_contact_at', '2026-11-02T17:42:00+00:00')
            ->assertJsonPath('data.customer.origin', 'form')
            ->assertJsonPath('data.customer.project.contract_type', 'sale')
            ->assertJsonPath('data.customer.project.budget_max', 70000000)
            ->assertJsonPath('data.customer.project.budget_min', null)
            ->assertJsonPath('data.customer.project.property_types', ['house'])
            ->assertJsonPath('data.customer.project.neighborhoods', ['Thiès Nord']);
    }

    /** Une visite passée dans une AUTRE agence n'est pas « la dernière visite » de la fiche de celle-ci. */
    public function test_la_visite_d_une_autre_agence_ne_compte_pas(): void
    {
        $this->avecLaDemande();
        $ailleurs = Property::factory()->create(['agency_id' => Agency::factory()->create()->id]);
        $this->visite('2026-11-10 10:00:00', VisitStatus::Completed, $ailleurs);

        $this->faits($this->filDuBien(), $this->agent)
            ->assertJsonPath('data.customer.last_visit', null);
    }

    /** Sans visite ni demande : « Aucune encore », et le premier contact retombe sur la création de la fiche. */
    public function test_sans_visite_ni_demande(): void
    {
        $this->avecLaDemande();
        $this->fiche->forceFill(['source_contact_lead_id' => null])->save();
        $this->demande->forceFill(['customer_id' => null])->save();

        $this->faits($this->filDuBien(), $this->agent)
            ->assertJsonPath('data.customer.last_visit', null)
            ->assertJsonPath('data.customer.contact_lead', null)
            ->assertJsonPath('data.customer.first_contact_at', '2026-11-03T09:00:00+00:00')
            ->assertJsonPath('data.customer.origin', null);
    }

    /** Une fiche saisie à la main AVANT la demande qu'on lui rattache : le premier contact est la fiche, sans canal. */
    public function test_la_fiche_plus_ancienne_que_la_demande(): void
    {
        $this->avecLaDemande();
        $this->fiche->forceFill(['created_at' => Carbon::parse('2026-11-01 09:00:00', 'UTC')])->save();

        $this->faits($this->filDuBien(), $this->agent)
            ->assertJsonPath('data.customer.first_contact_at', '2026-11-01T09:00:00+00:00')
            ->assertJsonPath('data.customer.origin', null)
            // La demande liée reste celle qui a été rattachée.
            ->assertJsonPath('data.customer.contact_lead.id', $this->demande->id);
    }

    /** Sans `source_contact_lead_id` : la dernière demande de la fiche sur le bien du fil. */
    public function test_la_demande_liee_retombe_sur_la_derniere_du_bien_du_fil(): void
    {
        $this->avecLaDemande();
        $this->fiche->forceFill(['source_contact_lead_id' => null])->save();
        $recente = PropertyContactLead::factory()->create([
            'property_id' => $this->maison->id,
            'agency_id' => $this->agency->id,
            'recipient_user_id' => $this->agent->id,
            'customer_id' => $this->fiche->id,
        ]);
        $recente->forceFill(['created_at' => Carbon::parse('2026-11-10 08:00:00', 'UTC')])->save();
        // Une demande plus récente encore, mais sur un autre bien : pas celle du fil.
        PropertyContactLead::factory()->create([
            'agency_id' => $this->agency->id,
            'property_id' => Property::factory()->create(['agency_id' => $this->agency->id])->id,
            'customer_id' => $this->fiche->id,
        ]);

        $this->faits($this->filDuBien(), $this->agent)
            ->assertJsonPath('data.customer.contact_lead.id', $recente->id)
            // Le premier contact reste la plus ancienne demande de la fiche.
            ->assertJsonPath('data.customer.first_contact_at', '2026-11-02T17:42:00+00:00');
    }

    /** La demande liée n'est rendue qu'à qui peut la lire (`PropertyContactLeadPolicy::view`). */
    public function test_la_demande_liee_suit_sa_policy(): void
    {
        $this->avecLaDemande();
        // Une demande destinée à un autre, d'une autre agence : l'agent ne la lit pas.
        $autre = Agency::factory()->create();
        $this->demande->forceFill(['agency_id' => $autre->id, 'recipient_user_id' => User::factory()->create()->id])->save();

        $this->faits($this->filDuBien(), $this->agent)
            ->assertJsonPath('data.customer.contact_lead', null);
    }

    /**
     * Le personnel qui ne lit pas la fiche dans le CRM (`CustomerPolicy::view`) n'en lit ni le projet
     * ni les faits : la colonne ne montre pas plus que le CRM (TCK-2724).
     */
    public function test_sans_lecture_de_la_fiche_aucun_fait(): void
    {
        $this->avecLaDemande();
        $this->visite('2026-11-08 10:00:00', VisitStatus::Completed);
        $collegue = $this->agentWithout($this->agency, Capability::CrmViewAll);
        Sanctum::actingAs($collegue);
        $this->getJson("/api/customers/{$this->fiche->id}")->assertForbidden();

        $fil = Conversation::factory()->create(['type' => ConversationType::Direct, 'subject' => null, 'created_by' => $this->malick->id]);
        foreach ([$collegue, $this->malick] as $membre) {
            $fil->participants()->attach($membre->id, ['joined_at' => now()]);
        }

        $this->faits($fil, $collegue)
            ->assertJsonPath('data.customer.id', $this->fiche->id)
            ->assertJsonPath('data.customer.project', null)
            ->assertJsonPath('data.customer.last_visit', null)
            ->assertJsonPath('data.customer.contact_lead', null)
            ->assertJsonPath('data.customer.first_contact_at', null)
            ->assertJsonPath('data.customer.origin', null);
    }
}

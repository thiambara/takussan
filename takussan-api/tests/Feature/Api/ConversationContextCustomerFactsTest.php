<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Enums\ContactLeadChannel;
use App\Models\Enums\ConversationType;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\RelationshipStatus;
use App\Models\Enums\RelationshipType;
use App\Models\Enums\VisitStatus;
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
 * TCK-2858 — la fiche client de la colonne de contexte d'un fil (`GET /api/conversations/{id}/context`)
 * dit le PROJET du client, sa DERNIÈRE VISITE passée dans l'agence, son PREMIER CONTACT (date et canal)
 * et la DEMANDE DE CONTACT liée — au seul personnel de l'agence du fil, et seulement s'il lit la fiche
 * dans le CRM (`customerReadable`, la règle de `stage` et `phone`, TCK-2724).
 */
class ConversationContextCustomerFactsTest extends TestCase
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

        Carbon::setTestNow(Carbon::parse('2026-11-15 10:00:00', 'UTC'));

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->create(['first_name' => 'Fatou', 'last_name' => 'Sow']);
        $this->materializeRoleProfile($this->agent, 'agent', $this->agency);
        $this->malick = User::factory()->create(['first_name' => 'Malick', 'last_name' => 'Seck']);

        $this->maison = Property::factory()->create([
            'title' => 'Maison avec jardin · Thiès',
            'user_id' => $this->agent->id,
            'agency_id' => $this->agency->id,
        ]);

        // La demande qui a créé la fiche, déposée sur l'annonce le 2 novembre.
        $this->demande = PropertyContactLead::factory()->create([
            'property_id' => $this->maison->id,
            'agency_id' => $this->agency->id,
            'recipient_user_id' => $this->agent->id,
            'channel' => ContactLeadChannel::Form,
        ]);
        $this->demande->forceFill(['created_at' => Carbon::parse('2026-11-02 17:42:00', 'UTC')])->save();

        $this->fiche = Customer::factory()->create([
            'agency_id' => $this->agency->id,
            'user_id' => $this->malick->id,
            'added_by_id' => $this->agent->id,
            'first_name' => 'Malick',
            'last_name' => 'Seck',
            'pipeline_stage' => CustomerPipelineStage::Qualified,
            'seeking_contract_type' => 'sale',
            'budget_max' => 70000000,
            'seeking_property_types' => ['house'],
            'seeking_neighborhoods' => ['Thiès Nord'],
        ]);
        $this->fiche->forceFill([
            'source_contact_lead_id' => $this->demande->id,
            'created_at' => Carbon::parse('2026-11-03 09:00:00', 'UTC'),
        ])->save();
        $this->demande->forceFill(['customer_id' => $this->fiche->id])->save();

        UserCustomerRelationship::query()->create([
            'user_id' => $this->agent->id,
            'customer_id' => $this->fiche->id,
            'relationship_type' => RelationshipType::AgentClient,
            'status' => RelationshipStatus::Active,
            'is_primary' => true,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function fil(array $attributs = []): Conversation
    {
        $fil = Conversation::factory()->create([
            'type' => ConversationType::Direct,
            'subject' => null,
            'created_by' => $this->malick->id,
            'property_id' => $this->maison->id,
            ...$attributs,
        ]);
        foreach ([$this->agent, $this->malick] as $membre) {
            $fil->participants()->attach($membre->id, ['joined_at' => now()]);
        }

        return $fil;
    }

    private function contexte(Conversation $fil, User $lecteur): TestResponse
    {
        Sanctum::actingAs($lecteur);

        return $this->getJson("/api/conversations/{$fil->id}/context")->assertOk();
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
        $visiteDu8 = $this->visite('2026-11-08 10:00:00', VisitStatus::Completed);
        $this->visite('2026-11-05 10:00:00', VisitStatus::Completed);
        // Ni une visite annulée, ni une absence, ni une visite à venir ne sont « la dernière visite ».
        $this->visite('2026-11-12 10:00:00', VisitStatus::Cancelled);
        $this->visite('2026-11-13 10:00:00', VisitStatus::NoShow);
        $this->visite('2026-11-20 10:00:00', VisitStatus::Confirmed);

        $this->contexte($this->fil(), $this->agent)
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
        $ailleurs = Property::factory()->create(['agency_id' => Agency::factory()->create()->id]);
        $this->visite('2026-11-10 10:00:00', VisitStatus::Completed, $ailleurs);

        $this->contexte($this->fil(), $this->agent)
            ->assertJsonPath('data.customer.last_visit', null);
    }

    /** Sans visite ni demande : « Aucune encore », et le premier contact retombe sur la création de la fiche. */
    public function test_sans_visite_ni_demande(): void
    {
        $this->fiche->forceFill(['source_contact_lead_id' => null])->save();
        $this->demande->forceFill(['customer_id' => null])->save();

        $this->contexte($this->fil(), $this->agent)
            ->assertJsonPath('data.customer.last_visit', null)
            ->assertJsonPath('data.customer.contact_lead', null)
            ->assertJsonPath('data.customer.first_contact_at', '2026-11-03T09:00:00+00:00')
            ->assertJsonPath('data.customer.origin', null);
    }

    /** Une fiche saisie à la main AVANT la demande qu'on lui rattache : le premier contact est la fiche, sans canal. */
    public function test_la_fiche_plus_ancienne_que_la_demande(): void
    {
        $this->fiche->forceFill(['created_at' => Carbon::parse('2026-11-01 09:00:00', 'UTC')])->save();

        $this->contexte($this->fil(), $this->agent)
            ->assertJsonPath('data.customer.first_contact_at', '2026-11-01T09:00:00+00:00')
            ->assertJsonPath('data.customer.origin', null)
            // La demande liée reste celle qui a été rattachée.
            ->assertJsonPath('data.customer.contact_lead.id', $this->demande->id);
    }

    /** Sans `source_contact_lead_id` : la dernière demande de la fiche sur le bien du fil. */
    public function test_la_demande_liee_retombe_sur_la_derniere_du_bien_du_fil(): void
    {
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

        $this->contexte($this->fil(), $this->agent)
            ->assertJsonPath('data.customer.contact_lead.id', $recente->id)
            // Le premier contact reste la plus ancienne demande de la fiche.
            ->assertJsonPath('data.customer.first_contact_at', '2026-11-02T17:42:00+00:00');
    }

    /** La demande liée n'est rendue qu'à qui peut la lire (`PropertyContactLeadPolicy::view`). */
    public function test_la_demande_liee_suit_sa_policy(): void
    {
        // Une demande destinée à un autre, d'une autre agence : l'agent ne la lit pas.
        $autre = Agency::factory()->create();
        $this->demande->forceFill(['agency_id' => $autre->id, 'recipient_user_id' => User::factory()->create()->id])->save();

        $this->contexte($this->fil(), $this->agent)
            ->assertJsonPath('data.customer.contact_lead', null);
    }

    /**
     * Le personnel qui ne lit pas la fiche dans le CRM (`CustomerPolicy::view`) n'en lit ni le projet
     * ni les faits : la colonne ne montre pas plus que le CRM (TCK-2724).
     */
    public function test_sans_lecture_de_la_fiche_aucun_fait(): void
    {
        $this->visite('2026-11-08 10:00:00', VisitStatus::Completed);
        $collegue = $this->agentWithout($this->agency, Capability::CrmViewAll);
        Sanctum::actingAs($collegue);
        $this->getJson("/api/customers/{$this->fiche->id}")->assertForbidden();

        $fil = Conversation::factory()->create(['type' => ConversationType::Direct, 'subject' => null, 'created_by' => $this->malick->id]);
        foreach ([$collegue, $this->malick] as $membre) {
            $fil->participants()->attach($membre->id, ['joined_at' => now()]);
        }

        $this->contexte($fil, $collegue)
            ->assertJsonPath('data.customer.id', $this->fiche->id)
            ->assertJsonPath('data.customer.project', null)
            ->assertJsonPath('data.customer.last_visit', null)
            ->assertJsonPath('data.customer.contact_lead', null)
            ->assertJsonPath('data.customer.first_contact_at', null)
            ->assertJsonPath('data.customer.origin', null);
    }
}

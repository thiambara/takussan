<?php

namespace Tests\Feature\Api\Me;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\CustomerNote;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\CustomerNoteKind;
use App\Models\Enums\LastContactChannel;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2942 — le premier prospect de l'agent porte son besoin, son budget, son dernier contact, son
 * origine et la note de l'agence (`GET /api/me/agent-profiles/{id}/first-lead`), et `complete()`
 * rend la même projection.
 */
class AgentFirstLeadProjectionTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Agency $agency;

    private AgentProfile $agent;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->agency = Agency::factory()->create();
        $this->agent = AgentProfile::factory()->create([
            'user_id' => $this->user->id,
            'agency_id' => $this->agency->id,
            // Pendant l'assistant, le profil est encore un brouillon.
            'status' => AgentProfileStatus::Draft,
        ]);
        Sanctum::actingAs($this->user);
    }

    private function prospect(array $attributs = []): Customer
    {
        return Customer::factory()->create([
            'added_by_id' => $this->user->id,
            'agency_id' => $this->agency->id,
            'first_name' => 'Mamadou',
            'last_name' => 'Sarr',
            'notes' => null,
            ...$attributs,
        ]);
    }

    public function test_ac1_le_prospect_complet_est_rendu_avec_ses_six_informations(): void
    {
        $this->travelTo(Carbon::parse('2026-11-15 10:00:00', 'UTC'));

        $villa = Property::factory()->create(['agency_id' => $this->agency->id, 'title' => 'Villa Mermoz']);
        $lead = PropertyContactLead::factory()->create(['property_id' => $villa->id]);

        $customer = $this->prospect([
            'seeking_contract_type' => 'rent',
            'seeking_property_types' => ['apartment'],
            'seeking_neighborhoods' => ['Sacré-Cœur'],
            'min_bedrooms' => 3,
            'budget_min' => 300000,
            'budget_max' => 400000,
        ]);
        $customer->forceFill([
            'last_contacted_at' => Carbon::parse('2026-11-14 17:40:00', 'UTC'),
            'last_contact_channel' => LastContactChannel::Whatsapp,
            'source_contact_lead_id' => $lead->id,
        ])->save();

        $admin = User::factory()->create(['first_name' => 'Awa', 'last_name' => 'Diop']);
        CustomerNote::factory()->create([
            'customer_id' => $customer->id,
            'author_id' => $admin->id,
            'body' => 'Préfère visiter le samedi matin.',
        ]);

        $c = $this->getJson("/api/me/agent-profiles/{$this->agent->id}/first-lead")
            ->assertOk()
            ->json('data.customer');

        $this->assertSame($customer->id, $c['id']);
        $this->assertSame([
            'contract_type' => 'rent',
            'property_types' => ['apartment'],
            'cities' => [],
            'neighborhoods' => ['Sacré-Cœur'],
            'min_bedrooms' => 3,
        ], $c['need']);
        $this->assertSame('300000.00', $c['budget_min']);
        $this->assertSame('400000.00', $c['budget_max']);
        $this->assertSame('2026-11-14T17:40:00+00:00', $c['last_contacted_at']);
        $this->assertSame('whatsapp', $c['last_contact_channel']);
        $this->assertSame('contact_lead', $c['origin']['kind']);
        $this->assertSame('Villa Mermoz', $c['origin']['property_title']);
        $this->assertSame($villa->id, $c['origin']['property_id']);
        $this->assertSame($villa->fresh()->reference_number, $c['origin']['property_reference']);
        $this->assertSame('Préfère visiter le samedi matin.', $c['agency_note']['body']);
        $this->assertSame('Awa Diop', $c['agency_note']['author_name']);
    }

    public function test_ac2_un_prospect_sans_donnees_rend_ses_champs_a_null(): void
    {
        $this->prospect();

        $this->getJson("/api/me/agent-profiles/{$this->agent->id}/first-lead")
            ->assertOk()
            ->assertJsonPath('data.customer.full_name', 'Mamadou Sarr')
            ->assertJsonPath('data.customer.need', null)
            ->assertJsonPath('data.customer.budget_min', null)
            ->assertJsonPath('data.customer.budget_max', null)
            ->assertJsonPath('data.customer.last_contacted_at', null)
            ->assertJsonPath('data.customer.last_contact_channel', null)
            ->assertJsonPath('data.customer.origin', null)
            ->assertJsonPath('data.customer.agency_note', null);
    }

    /**
     * `customer_notes` n'a pas de note privée : les seules notes réservées sont les natures du
     * personnel (`CustomerNoteKind::staffOnlyValues()`) ; elles, comme les notes d'étape, ne sont
     * jamais la note de l'agence rendue à l'assistant.
     */
    public function test_ac2_les_notes_reservees_au_personnel_et_les_notes_d_etape_ne_sont_pas_rendues(): void
    {
        $customer = $this->prospect();
        foreach ([CustomerNoteKind::VisitReport, CustomerNoteKind::LeadMessage, CustomerNoteKind::Loss] as $kind) {
            CustomerNote::factory()->create([
                'customer_id' => $customer->id,
                'body' => 'Réservé : '.$kind->value,
                'kind' => $kind,
                'pinned' => true,
            ]);
        }

        $this->getJson("/api/me/agent-profiles/{$this->agent->id}/first-lead")
            ->assertOk()
            ->assertJsonPath('data.customer.agency_note', null);
    }

    public function test_la_note_epinglee_prime_et_la_colonne_de_la_fiche_sert_a_defaut(): void
    {
        $customer = $this->prospect(['notes' => 'Note de la fiche']);

        $this->getJson("/api/me/agent-profiles/{$this->agent->id}/first-lead")
            ->assertJsonPath('data.customer.agency_note.body', 'Note de la fiche')
            ->assertJsonPath('data.customer.agency_note.author_name', null);

        CustomerNote::factory()->create(['customer_id' => $customer->id, 'body' => 'Épinglée', 'pinned' => true]);
        CustomerNote::factory()->create(['customer_id' => $customer->id, 'body' => 'Plus récente']);

        $this->getJson("/api/me/agent-profiles/{$this->agent->id}/first-lead")
            ->assertJsonPath('data.customer.agency_note.body', 'Épinglée');
    }

    public function test_sans_demande_l_origine_est_le_bien_d_interet(): void
    {
        $bien = Property::factory()->create(['agency_id' => $this->agency->id, 'title' => 'Appartement Point E']);
        $this->prospect()->forceFill(['interested_property_id' => $bien->id])->save();

        $this->getJson("/api/me/agent-profiles/{$this->agent->id}/first-lead")
            ->assertJsonPath('data.customer.origin.kind', 'interested_property')
            ->assertJsonPath('data.customer.origin.property_title', 'Appartement Point E');
    }

    public function test_le_profil_d_un_autre_compte_est_refuse(): void
    {
        $this->prospect(['notes' => 'Secret']);
        Sanctum::actingAs(User::factory()->create());

        $this->getJson("/api/me/agent-profiles/{$this->agent->id}/first-lead")->assertForbidden();
    }
}

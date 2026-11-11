<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\VisitStatus;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Crm\ContactGestureService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2583 (ADR-0103 § 1) — le dernier contact d'une fiche avance avec un geste (sur la fiche ou
 * sur sa demande convertie), une note, une visite terminée et un compte rendu ; il ne recule jamais.
 * Et le journal de la fiche rend une ligne par geste, avec son canal.
 */
class CustomerLastContactedTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agence = $this->agence();
        $this->agent = $this->personnel($this->agence);
    }

    private function fiche(): Customer
    {
        return $this->ficheClient($this->agence, $this->client(), ['added_by_id' => $this->agent->id]);
    }

    private function dernierContact(Customer $fiche): ?string
    {
        return $fiche->fresh()->last_contacted_at?->format('Y-m-d H:i:s');
    }

    /** AC2 — la demande convertie, puis le WhatsApp de 09:30 : la fiche a 09:30 et une ligne « WhatsApp » au journal. */
    public function test_ac2_le_geste_sur_la_demande_convertie_avance_la_fiche_et_entre_au_journal(): void
    {
        $this->travelTo(Carbon::parse('2026-11-10 08:00:00'));
        $lead = PropertyContactLead::factory()->create([
            'property_id' => $this->bienDe($this->agence)->id,
            'agency_id' => $this->agence->id,
            'recipient_user_id' => $this->agent->id,
            'name' => 'Awa Diop', 'phone' => '+221771234567',
        ]);

        Sanctum::actingAs($this->agent);
        $this->travelTo(Carbon::parse('2026-11-10 08:45:00'));
        $customerId = $this->postJson("/api/contact-leads/{$lead->id}/convert")->assertCreated()->json('customer.id');
        $fiche = Customer::query()->findOrFail($customerId);
        $this->assertNull($fiche->last_contacted_at);

        $this->travelTo(Carbon::parse('2026-11-10 09:30:00'));
        $this->postJson("/api/contact-leads/{$lead->id}/contacts", ['channel' => 'whatsapp'])->assertNoContent();

        $this->assertSame('2026-11-10 09:30:00', $this->dernierContact($fiche));

        $journal = collect($this->getJson("/api/customers/{$fiche->id}/activity")->assertOk()->json('data'));
        $geste = $journal->firstWhere('event', 'contacted');
        $this->assertNotNull($geste, 'le geste sur la demande convertie doit entrer au journal de la fiche');
        $this->assertSame('lead', $geste['subject']);
        $this->assertSame($lead->id, $geste['subject_id']);
        $this->assertSame('whatsapp', $geste['channel']);
        $this->assertSame($this->agent->id, $geste['causer']['id']);

        $this->getJson("/api/customers/{$fiche->id}")
            ->assertOk()
            ->assertJsonPath('data.last_contacted_at', '2026-11-10T09:30:00+00:00');
    }

    /** Un geste sur la fiche elle-même entre aussi au journal, avec son canal. */
    public function test_le_geste_sur_la_fiche_entre_au_journal(): void
    {
        $fiche = $this->fiche();

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/customers/{$fiche->id}/contacts", ['channel' => 'call'])->assertNoContent();

        $geste = collect($this->getJson("/api/customers/{$fiche->id}/activity")->assertOk()->json('data'))
            ->firstWhere('event', 'contacted');
        $this->assertSame('customer', $geste['subject']);
        $this->assertSame('call', $geste['channel']);
    }

    /** Un geste sur une demande NON convertie ne touche aucune fiche et n'entre dans aucun journal de fiche. */
    public function test_la_demande_non_convertie_ne_touche_aucune_fiche(): void
    {
        $fiche = $this->fiche();
        $lead = PropertyContactLead::factory()->create([
            'property_id' => $this->bienDe($this->agence)->id,
            'agency_id' => $this->agence->id,
            'recipient_user_id' => $this->agent->id,
        ]);

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/contact-leads/{$lead->id}/contacts", ['channel' => 'email'])->assertNoContent();

        $this->assertNull($this->dernierContact($fiche));
        $this->assertNull(collect($this->getJson("/api/customers/{$fiche->id}/activity")->json('data'))
            ->firstWhere('event', 'contacted'));
    }

    public function test_une_note_avance_le_dernier_contact(): void
    {
        $fiche = $this->fiche();

        Sanctum::actingAs($this->agent);
        $this->travelTo(Carbon::parse('2026-11-10 14:00:00'));
        $this->postJson("/api/customers/{$fiche->id}/notes", ['body' => 'Rappelé, rappellera lundi.'])->assertCreated();

        $this->assertSame('2026-11-10 14:00:00', $this->dernierContact($fiche));
    }

    public function test_une_visite_terminee_avance_le_dernier_contact(): void
    {
        $fiche = $this->fiche();
        $visite = PropertyVisit::factory()->create([
            'property_id' => $this->bienDe($this->agence)->id,
            'visitor_id' => $fiche->user_id,
            'customer_id' => $fiche->id,
            'agent_id' => $this->agent->id,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => Carbon::parse('2026-11-10 10:00:00'),
        ]);

        Sanctum::actingAs($this->agent);
        $this->travelTo(Carbon::parse('2026-11-10 11:00:00'));
        $this->postJson("/api/property-visits/{$visite->id}/complete")->assertOk();

        $this->assertSame('2026-11-10 11:00:00', $this->dernierContact($fiche));
    }

    public function test_un_compte_rendu_avance_le_dernier_contact(): void
    {
        $fiche = $this->fiche();
        $visite = PropertyVisit::factory()->create([
            'property_id' => $this->bienDe($this->agence)->id,
            'visitor_id' => $fiche->user_id,
            'customer_id' => $fiche->id,
            'agent_id' => $this->agent->id,
            'status' => VisitStatus::Completed,
            'scheduled_at' => Carbon::parse('2026-11-10 10:00:00'),
            'completed_at' => Carbon::parse('2026-11-10 11:00:00'),
        ]);

        Sanctum::actingAs($this->agent);
        $this->travelTo(Carbon::parse('2026-11-10 16:20:00'));
        $this->postJson("/api/property-visits/{$visite->id}/report", ['outcome' => 'interested'])->assertCreated();

        $this->assertSame('2026-11-10 16:20:00', $this->dernierContact($fiche));
    }

    /** Le dernier contact ne recule jamais : un contact daté plus tôt ne l'écrase pas. */
    public function test_le_dernier_contact_ne_recule_pas(): void
    {
        $fiche = $this->fiche();
        $service = app(ContactGestureService::class);

        $service->touchCustomer($fiche, Carbon::parse('2026-11-10 12:00:00'));
        $service->touchCustomer($fiche->id, Carbon::parse('2026-11-09 09:00:00'));

        $this->assertSame('2026-11-10 12:00:00', $this->dernierContact($fiche));
        $this->assertSame('2026-11-10 12:00:00', $fiche->last_contacted_at?->format('Y-m-d H:i:s'));
    }
}

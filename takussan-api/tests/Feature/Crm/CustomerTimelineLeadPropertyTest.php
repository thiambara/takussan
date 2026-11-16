<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\CustomerNote;
use App\Models\Enums\CustomerNoteKind;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\User;
use App\Services\Lead\ContactLeadService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2878 (TCK-2875 AC6) — la note `lead_message` du fil sert le bien de la demande dont elle
 * reprend le message : l'historique d'une candidature y borne « Demande de contact reçue » à son bien.
 * La note nomme sa demande (`contact_lead_id`), posée au rattachement (`ContactLeadService::linkLead`).
 */
class CustomerTimelineLeadPropertyTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $admin;

    private Property $bien;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->agence = $this->agence();
        $this->admin = $this->personnel($this->agence, 'agency_admin');
        $this->bien = $this->bienDe($this->agence, $this->bailleur($this->agence));
    }

    /** @return array<string, mixed> la note `lead_message` du fil, lue par le personnel */
    private function noteDeLaDemande(Customer $fiche): array
    {
        Sanctum::actingAs($this->admin);
        $notes = collect($this->getJson("/api/customers/{$fiche->id}/timeline?filter[type]=note")->assertOk()->json('data'))
            ->where('kind', 'lead_message')->values();
        $this->assertCount(1, $notes);

        return $notes[0];
    }

    public function test_la_demande_rattachee_sert_son_bien_sur_la_note_du_fil(): void
    {
        $fiche = $this->ficheClient($this->agence);
        $lead = PropertyContactLead::factory()->create(['property_id' => $this->bien->id, 'message' => 'Une visite samedi ?']);

        app(ContactLeadService::class)->attach($lead, $fiche, $this->admin);

        $this->assertSame($lead->id, CustomerNote::query()->where('customer_id', $fiche->id)->value('contact_lead_id'));
        $this->assertSame(['id' => $this->bien->id, 'title' => $this->bien->title], $this->noteDeLaDemande($fiche)['property']);
    }

    public function test_une_note_sans_demande_sert_un_bien_nul(): void
    {
        $fiche = $this->ficheClient($this->agence);
        CustomerNote::factory()->create(['customer_id' => $fiche->id, 'author_id' => null, 'kind' => CustomerNoteKind::LeadMessage, 'body' => 'Bonjour']);

        $note = $this->noteDeLaDemande($fiche);
        $this->assertArrayHasKey('property', $note);
        $this->assertNull($note['property']);
    }

    public function test_une_note_ordinaire_ne_porte_pas_la_cle(): void
    {
        $fiche = $this->ficheClient($this->agence);
        CustomerNote::factory()->create(['customer_id' => $fiche->id, 'author_id' => $this->admin->id, 'body' => 'Rappeler lundi']);

        Sanctum::actingAs($this->admin);
        $note = $this->getJson("/api/customers/{$fiche->id}/timeline?filter[type]=note")->assertOk()->json('data.0');
        $this->assertArrayNotHasKey('property', $note);
    }
}

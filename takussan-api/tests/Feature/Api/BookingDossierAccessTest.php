<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2872 (ADR-0110 § 2, ADR-0099) — aucun autre candidat du même bien ne lit une pièce d'une
 * autre réservation : ni par la politique (403 sur le document, sur le dossier, sur le dépôt), ni
 * par la liste (`GET /api/documents`, avec ou sans cible). Le personnel d'une autre agence non plus.
 */
class BookingDossierAccessTest extends TestCase
{
    use RefreshDatabase;

    private User $agent;

    private User $client;

    private User $rival;

    private Booking $booking;

    private Booking $rivalBooking;

    private int $documentId;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-15 10:00:00');

        $agency = Agency::factory()->create();
        $this->agent = User::factory()->withAgentProfile($agency)->create();
        $this->client = User::factory()->create();
        $this->rival = User::factory()->create();
        $property = Property::factory()->published()->create([
            'agency_id' => $agency->id, 'currency' => Currency::XOF,
            'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly, 'price' => '300000',
        ]);

        // Deux candidats au MÊME bien, chacun par le tunnel public.
        Sanctum::actingAs($this->client);
        $this->booking = Booking::query()->findOrFail($this->postJson("/api/public/properties/{$property->slug}/booking-request", [
            'start_date' => '2026-12-01', 'end_date' => '2027-12-01',
        ])->assertCreated()->json('data.id'));
        Sanctum::actingAs($this->rival);
        $this->rivalBooking = Booking::query()->findOrFail($this->postJson("/api/public/properties/{$property->slug}/booking-request", [
            'start_date' => '2026-12-01', 'end_date' => '2027-12-01',
        ])->assertCreated()->json('data.id'));

        Sanctum::actingAs($this->client);
        $this->documentId = $this->post("/api/bookings/{$this->booking->id}/dossier/identity/document", [
            'file' => UploadedFile::fake()->create('cni.pdf', 12, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated()->json('data.document.id');
    }

    public function test_ac2_another_candidate_on_the_same_property_cannot_open_the_piece(): void
    {
        Sanctum::actingAs($this->rival);

        $this->getJson("/api/documents/{$this->documentId}")->assertForbidden();
        $this->getJson("/api/bookings/{$this->booking->id}/dossier")->assertForbidden();
        $this->post("/api/bookings/{$this->booking->id}/dossier/payslips/document", [
            'file' => UploadedFile::fake()->create('x.pdf', 12, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertForbidden();

        // Son propre dossier, lui, se lit et se remplit.
        $this->getJson("/api/bookings/{$this->rivalBooking->id}/dossier")->assertOk()->assertJsonPath('data.received', 0);
    }

    public function test_ac2_another_candidate_does_not_list_the_piece(): void
    {
        Sanctum::actingAs($this->rival);

        $sansCible = collect($this->getJson('/api/documents')->assertOk()->json('data'))->pluck('id');
        $this->assertNotContains($this->documentId, $sansCible);

        $cible = collect($this->getJson("/api/documents?filter[documentable_type]=booking&filter[documentable_id]={$this->booking->id}")
            ->assertOk()->json('data'))->pluck('id');
        $this->assertNotContains($this->documentId, $cible);

        // Le client, lui, la liste sur sa réservation, et le personnel de l'agence aussi.
        foreach ([$this->client, $this->agent] as $lecteur) {
            Sanctum::actingAs($lecteur);
            $this->assertContains($this->documentId, collect($this->getJson("/api/documents?filter[documentable_type]=booking&filter[documentable_id]={$this->booking->id}")
                ->assertOk()->json('data'))->pluck('id'));
        }
    }

    public function test_the_staff_of_another_agency_reads_and_writes_nothing(): void
    {
        $autre = User::factory()->withAgentProfile(Agency::factory()->create())->create();
        Sanctum::actingAs($autre);

        $this->getJson("/api/documents/{$this->documentId}")->assertForbidden();
        $this->getJson("/api/bookings/{$this->booking->id}/dossier")->assertForbidden();
        $this->postJson("/api/bookings/{$this->booking->id}/dossier/payslips/request")->assertForbidden();
    }

    public function test_the_customer_does_not_get_another_customer_card_through_a_missing_customer(): void
    {
        // Une fiche client sans compte : personne n'y dépose en se faisant passer pour le client.
        $sansCompte = Customer::factory()->create(['agency_id' => $this->booking->agency_id, 'user_id' => null]);
        $this->rivalBooking->forceFill(['customer_id' => $sansCompte->id])->save();

        Sanctum::actingAs(User::factory()->create());
        $this->post("/api/bookings/{$this->rivalBooking->id}/dossier/identity/document", [
            'file' => UploadedFile::fake()->create('x.pdf', 12, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertForbidden();
    }
}

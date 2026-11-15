<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\RentPeriod;
use App\Models\Guarantor;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2893 (ADR-0110 § 3) — les garants d'une candidature ou d'une offre : rattacher un garant
 * existant ou créé à la volée, trois au plus, jamais sur un séjour ; le dossier gagne les deux
 * pièces du garant, et le dernier retiré les retire tant qu'elles ne sont pas reçues. Le garant
 * facultatif de la création suit la même règle, par la saisie du personnel comme par le tunnel.
 */
class BookingGuarantorTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $client;

    private Customer $customer;

    private Property $monthly;

    private Property $sale;

    private Property $daily;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-15 10:00:00');

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->withAgentProfile($this->agency)->create();
        $this->client = User::factory()->create();
        $this->customer = Customer::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->client->id]);
        $commun = ['agency_id' => $this->agency->id, 'currency' => Currency::XOF];
        $this->monthly = Property::factory()->published()->create($commun + [
            'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly, 'price' => '300000',
        ]);
        $this->sale = Property::factory()->published()->create($commun + [
            'contract_type' => ContractType::Sale, 'rent_period' => null, 'price' => '95000000',
        ]);
        $this->daily = Property::factory()->published()->create($commun + [
            'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Daily, 'price' => '20000',
        ]);
    }

    /** @param  array<string, mixed>  $extra */
    private function application(array $extra = []): Booking
    {
        Sanctum::actingAs($this->agent);
        $id = $this->postJson('/api/bookings', [
            'kind' => 'application', 'property_id' => $this->monthly->id,
            'customer_id' => $this->customer->id, 'start_date' => '2026-12-01',
        ] + $extra)->assertCreated()->json('data.id');

        return Booking::query()->findOrFail($id);
    }

    /** @param  array<string, mixed>  $data */
    private function attach(Booking $booking, array $data = []): TestResponse
    {
        return $this->postJson("/api/bookings/{$booking->id}/guarantors", $data + [
            'first_name' => 'Ibrahima', 'last_name' => 'Dieng', 'relationship_to_tenant' => 'son frère',
            'monthly_income' => 1200000,
        ]);
    }

    private function dossier(Booking $booking): array
    {
        Sanctum::actingAs($this->agent);

        return $this->getJson("/api/bookings/{$booking->id}")->assertOk()->json('data.dossier');
    }

    public function test_ac1_a_guarantor_adds_its_two_pieces_and_removing_it_before_receipt_takes_them_back(): void
    {
        $booking = $this->application();
        $this->assertSame(3, $this->dossier($booking)['required']);

        $id = $this->attach($booking)->assertCreated()
            ->assertJsonPath('data.booking_id', $booking->id)
            ->assertJsonPath('data.guarantors_count', 1)
            ->json('data.guarantor_id');

        $dossier = $this->dossier($booking);
        $this->assertSame(5, $dossier['required']);
        $this->assertSame(['identity', 'payslips', 'employment_certificate', 'guarantor_commitment', 'guarantor_identity'], $dossier['missing']);
        $this->getJson("/api/bookings/{$booking->id}")->assertOk()
            ->assertJsonPath('data.has_guarantor', true)
            ->assertJsonPath('data.guarantors', [[
                'id' => $id, 'first_name' => 'Ibrahima', 'last_name' => 'Dieng', 'relationship_to_tenant' => 'son frère',
            ]]);

        // La fiche neuve entre dans l'agence du bien, avec son revenu chiffré (ADR-0070).
        $garant = Guarantor::query()->findOrFail($id);
        $this->assertSame($this->agency->id, (int) $garant->agency_id);
        $this->assertSame($this->agent->id, (int) $garant->added_by_id);

        $this->deleteJson("/api/bookings/{$booking->id}/guarantors/{$id}")->assertOk()->assertJsonPath('data.guarantors_count', 0);
        $this->assertSame(['received' => 0, 'required' => 3, 'missing' => ['identity', 'payslips', 'employment_certificate']], $this->dossier($booking));
        $this->getJson("/api/bookings/{$booking->id}")->assertJsonPath('data.has_guarantor', false)->assertJsonPath('data.guarantors', []);
    }

    public function test_only_the_last_guarantor_removed_takes_the_pieces_back_and_a_received_piece_stays(): void
    {
        $booking = $this->application();
        $premier = $this->attach($booking)->assertCreated()->json('data.guarantor_id');
        $second = $this->attach($booking, ['first_name' => 'Awa', 'last_name' => 'Ndiaye'])->assertCreated()->json('data.guarantor_id');

        $this->deleteJson("/api/bookings/{$booking->id}/guarantors/{$premier}")->assertOk();
        $this->assertSame(5, $this->dossier($booking)['required'], 'un garant reste : ses pièces restent attendues');

        $this->post("/api/bookings/{$booking->id}/dossier/guarantor_identity/document", [
            'file' => UploadedFile::fake()->create('cni-garant.pdf', 12, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated();

        $this->deleteJson("/api/bookings/{$booking->id}/guarantors/{$second}")->assertOk();
        $dossier = $this->dossier($booking);
        $this->assertSame(4, $dossier['required'], 'la pièce reçue du garant reste au dossier');
        $this->assertSame(1, $dossier['received']);
        $this->assertNotContains('guarantor_commitment', $dossier['missing']);
    }

    public function test_an_existing_guarantor_of_the_agency_is_attached_and_one_of_another_agency_is_refused(): void
    {
        $booking = $this->application();
        $maison = Guarantor::factory()->create(['added_by_id' => $this->agent->id, 'agency_id' => $this->agency->id]);
        // Saisie par l'agent lui-même (il la lit), mais d'une autre agence que le bien : refusée.
        $ailleurs = Guarantor::factory()->create(['added_by_id' => $this->agent->id, 'agency_id' => Agency::factory()->create()->id]);

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/bookings/{$booking->id}/guarantors", ['guarantor_id' => $maison->id])
            ->assertCreated()->assertJsonPath('data.guarantor_id', $maison->id);
        $this->postJson("/api/bookings/{$booking->id}/guarantors", ['guarantor_id' => $maison->id])
            ->assertStatus(422)->assertJsonPath('code', 'booking.guarantor_already_attached');
        $this->postJson("/api/bookings/{$booking->id}/guarantors", ['guarantor_id' => $ailleurs->id])->assertForbidden();

        $this->assertSame(1, $booking->guarantors()->count());
        $this->assertSame(2, Guarantor::query()->count(), 'aucune fiche créée par les refus');
    }

    public function test_ac3_a_fourth_guarantor_and_a_guarantor_on_a_stay_are_refused_without_an_orphan(): void
    {
        $booking = $this->application();
        foreach (['Un', 'Deux', 'Trois'] as $prenom) {
            $this->attach($booking, ['first_name' => $prenom])->assertCreated();
        }
        $this->attach($booking, ['first_name' => 'Quatre'])->assertStatus(422)->assertJsonPath('code', 'booking.max_guarantors');
        $this->assertSame(3, Guarantor::query()->count(), 'le refus ne laisse aucune fiche orpheline');

        $sejour = Booking::factory()->create([
            'property_id' => $this->daily->id, 'agency_id' => $this->agency->id, 'customer_id' => $this->customer->id,
            'status' => BookingStatus::Pending,
        ]);
        $this->attach($sejour)->assertStatus(422)->assertJsonPath('code', 'booking.guarantor_not_for_kind');
        $this->assertSame(3, Guarantor::query()->count());
    }

    public function test_an_offer_takes_a_guarantor_and_a_closed_request_does_not(): void
    {
        Sanctum::actingAs($this->agent);
        $offre = Booking::query()->findOrFail($this->postJson('/api/bookings', [
            'kind' => 'offer', 'property_id' => $this->sale->id, 'customer_id' => $this->customer->id, 'total_amount' => 90000000,
        ])->assertCreated()->json('data.id'));
        $this->attach($offre)->assertCreated();
        $this->assertSame(4, $this->dossier($offre)['required']);

        $close = $this->application();
        $close->forceFill(['status' => BookingStatus::Rejected])->save();
        $this->attach($close)->assertStatus(422)->assertJsonPath('code', 'booking.dossier_closed');
    }

    public function test_a_guarantor_not_attached_cannot_be_removed(): void
    {
        $booking = $this->application();
        $autre = Guarantor::factory()->create(['agency_id' => $this->agency->id]);

        Sanctum::actingAs($this->agent);
        $this->deleteJson("/api/bookings/{$booking->id}/guarantors/{$autre->id}")
            ->assertNotFound()->assertJsonPath('code', 'booking.guarantor_not_attached');
    }

    public function test_the_staff_declares_a_guarantor_when_recording_the_application(): void
    {
        $booking = $this->application(['guarantor' => ['first_name' => 'Ibrahima', 'last_name' => 'Dieng', 'relationship_to_tenant' => 'son frère']]);

        $this->assertSame(1, $booking->guarantors()->count());
        $this->assertSame(5, $this->dossier($booking)['required']);
    }

    public function test_the_public_tunnel_declares_a_new_guarantor_only_and_never_on_a_stay(): void
    {
        $candidat = User::factory()->create();
        Sanctum::actingAs($candidat);

        $id = $this->postJson("/api/public/properties/{$this->monthly->slug}/booking-request", [
            'start_date' => '2026-12-01', 'end_date' => '2027-12-01', 'guests' => 1,
            'guarantor' => ['first_name' => 'Ibrahima', 'last_name' => 'Dieng', 'relationship_to_tenant' => 'son frère'],
        ])->assertCreated()->assertJsonMissingPath('data.guarantors')->json('data.id');
        $booking = Booking::query()->findOrFail($id);
        $this->assertSame(['Ibrahima'], $booking->guarantors()->pluck('first_name')->all());
        $this->assertSame(5, $this->dossier($booking)['required']);

        Sanctum::actingAs($candidat);
        $offre = $this->postJson("/api/public/properties/{$this->sale->slug}/booking-request", [
            'offer_amount' => 85000000, 'offer_expires_at' => '2026-11-21', 'terms_accepted' => true,
            'guarantor' => ['first_name' => 'Awa', 'last_name' => 'Ndiaye'],
        ])->assertCreated()->json('data.id');
        $this->assertSame(1, Booking::query()->findOrFail($offre)->guarantors()->count());

        $existant = Guarantor::factory()->create(['added_by_id' => $candidat->id]);
        Sanctum::actingAs($candidat);
        $this->postJson("/api/public/properties/{$this->monthly->slug}/booking-request", [
            'start_date' => '2026-12-01', 'end_date' => '2027-12-01', 'guests' => 1,
            'guarantor' => ['guarantor_id' => $existant->id],
        ])->assertStatus(422)->assertJsonValidationErrors(['guarantor.guarantor_id']);

        $avant = [Booking::query()->count(), Guarantor::query()->count()];
        $this->postJson("/api/public/properties/{$this->daily->slug}/booking-request", [
            'start_date' => '2026-12-01', 'end_date' => '2026-12-03', 'guests' => 1,
            'guarantor' => ['first_name' => 'Awa', 'last_name' => 'Ndiaye'],
        ])->assertStatus(422)->assertJsonPath('code', 'booking.field_not_for_kind');
        $this->assertSame($avant, [Booking::query()->count(), Guarantor::query()->count()]);
    }
}

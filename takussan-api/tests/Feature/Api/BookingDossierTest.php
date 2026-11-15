<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingDossierItem;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\DossierPiece;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use App\Services\Booking\BookingDossierService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2872 (ADR-0110 § 2) — le dossier d'une candidature ou d'une offre : liste fixe par nature
 * posée à la création (tous les chemins), complétude dérivée et servie au client comme au
 * personnel, dépôt par l'un ou l'autre, 404 pour un séjour, 422 pour une demande close.
 */
class BookingDossierTest extends TestCase
{
    use RefreshDatabase;

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

        $agency = Agency::factory()->create();
        $this->agent = User::factory()->withAgentProfile($agency)->create();
        $this->client = User::factory()->create();
        $this->customer = Customer::factory()->create(['agency_id' => $agency->id, 'user_id' => $this->client->id]);
        $commun = ['agency_id' => $agency->id, 'currency' => Currency::XOF];
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

    private function application(): Booking
    {
        Sanctum::actingAs($this->agent);
        $id = $this->postJson('/api/bookings', [
            'kind' => 'application', 'property_id' => $this->monthly->id,
            'customer_id' => $this->customer->id, 'start_date' => '2026-12-01',
        ])->assertCreated()->json('data.id');

        return Booking::query()->findOrFail($id);
    }

    private function upload(Booking $booking, string $piece, ?UploadedFile $file = null): TestResponse
    {
        return $this->post("/api/bookings/{$booking->id}/dossier/{$piece}/document", [
            'file' => $file ?? UploadedFile::fake()->create('cni.pdf', 12, 'application/pdf'),
        ], ['Accept' => 'application/json']);
    }

    public function test_ac1_an_application_awaits_three_pieces_for_the_staff_and_the_customer(): void
    {
        $booking = $this->application();
        $attendu = ['received' => 0, 'required' => 3, 'missing' => ['identity', 'payslips', 'employment_certificate']];

        Sanctum::actingAs($this->agent);
        $this->getJson("/api/bookings/{$booking->id}")->assertOk()->assertJsonPath('data.dossier', $attendu);

        Sanctum::actingAs($this->client);
        $this->getJson("/api/bookings/{$booking->id}")->assertOk()->assertJsonPath('data.dossier', $attendu);
        $this->getJson("/api/bookings/{$booking->id}/dossier")
            ->assertOk()
            ->assertJsonPath('data.required', 3)
            ->assertJsonPath('data.missing', $attendu['missing'])
            ->assertJsonPath('data.pieces.*.piece', $attendu['missing'])
            ->assertJsonPath('data.pieces.0.received', false)
            ->assertJsonPath('data.pieces.0.document', null);
    }

    public function test_each_creation_path_lays_the_fixed_list_of_its_kind(): void
    {
        // Saisie du personnel : une offre.
        Sanctum::actingAs($this->agent);
        $offre = $this->postJson('/api/bookings', [
            'kind' => 'offer', 'property_id' => $this->sale->id,
            'customer_id' => $this->customer->id, 'total_amount' => 85000000,
        ])->assertCreated()->assertJsonPath('data.dossier.missing', ['identity', 'proof_of_funds'])->json('data.id');

        // Tunnel public : une offre, une candidature, un séjour.
        $acheteur = User::factory()->create();
        Sanctum::actingAs($acheteur);
        $this->postJson("/api/public/properties/{$this->sale->slug}/booking-request", [
            'offer_amount' => 85000000, 'offer_expires_at' => '2026-11-21', 'terms_accepted' => true,
        ])->assertCreated();
        $this->postJson("/api/public/properties/{$this->monthly->slug}/booking-request", [
            'start_date' => '2026-12-01', 'end_date' => '2027-12-01', 'guests' => 2,
        ])->assertCreated();
        $this->postJson("/api/public/properties/{$this->daily->slug}/booking-request", [
            'start_date' => '2026-12-01', 'end_date' => '2026-12-03', 'guests' => 2,
        ])->assertCreated();

        $pieces = fn (BookingKind $kind): array => BookingDossierItem::query()
            ->whereIn('booking_id', Booking::query()->where('kind', $kind->value)->pluck('id'))
            ->orderBy('booking_id')->orderBy('id')->pluck('piece')->map->value->all();

        $this->assertSame(['identity', 'proof_of_funds', 'identity', 'proof_of_funds'], $pieces(BookingKind::Offer));
        $this->assertSame(['identity', 'payslips', 'employment_certificate'], $pieces(BookingKind::Application));
        $this->assertSame([], $pieces(BookingKind::Stay));
        $this->assertSame(2, BookingDossierItem::query()->where('booking_id', $offre)->count());
    }

    public function test_the_list_serves_the_completeness_in_one_query_and_null_for_a_stay(): void
    {
        $application = $this->application();
        $stay = Booking::factory()->create(['property_id' => $this->daily->id, 'agency_id' => $this->daily->agency_id, 'customer_id' => $this->customer->id]);

        $requetes = function (): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson('/api/bookings?per_page=50')->assertOk();
            $n = collect(DB::getQueryLog())->filter(fn (array $q): bool => str_contains($q['query'], 'booking_dossier_items'))->count();
            DB::disableQueryLog();

            return $n;
        };

        Sanctum::actingAs($this->agent);
        $lignes = collect($this->getJson('/api/bookings')->assertOk()->json('data'))->keyBy('id');
        $this->assertSame(3, $lignes[$application->id]['dossier']['required']);
        $this->assertArrayHasKey('dossier', $lignes[$stay->id]);
        $this->assertNull($lignes[$stay->id]['dossier']);

        $avant = $requetes();
        $this->application();
        $this->application();
        Sanctum::actingAs($this->agent);
        $this->assertSame(1, $avant);
        $this->assertSame($avant, $requetes());
    }

    public function test_ac2_the_customer_uploads_his_identity_and_both_sides_open_it(): void
    {
        $booking = $this->application();

        Sanctum::actingAs($this->client);
        $documentId = $this->upload($booking, 'identity')
            ->assertCreated()
            ->assertJsonPath('data.piece', 'identity')
            ->assertJsonPath('data.received', true)
            ->assertJsonPath('dossier.received', 1)
            ->assertJsonPath('dossier.missing', ['payslips', 'employment_certificate'])
            ->json('data.document.id');

        $document = Document::query()->findOrFail($documentId);
        $this->assertSame(Booking::class, $document->documentable_type);
        $this->assertSame($booking->id, (int) $document->documentable_id);
        $this->assertSame($this->client->id, (int) $document->uploaded_by);
        $this->assertNotNull($document->getFirstMedia('file'));

        $this->getJson("/api/documents/{$documentId}")->assertOk();
        $this->getJson("/api/bookings/{$booking->id}")->assertJsonPath('data.dossier.received', 1);

        Sanctum::actingAs($this->agent);
        $this->getJson("/api/documents/{$documentId}")->assertOk();
        $this->getJson("/api/bookings/{$booking->id}/dossier")
            ->assertOk()
            ->assertJsonPath('data.received', 1)
            ->assertJsonPath('data.pieces.0.document.id', $documentId);
    }

    public function test_the_staff_of_the_agency_uploads_a_piece_too(): void
    {
        $booking = $this->application();

        Sanctum::actingAs($this->agent);
        $this->upload($booking, 'payslips', UploadedFile::fake()->image('bulletin.jpg'))
            ->assertCreated()
            ->assertJsonPath('dossier.missing', ['identity', 'employment_certificate']);
    }

    public function test_a_deleted_document_makes_the_piece_missing_again(): void
    {
        $booking = $this->application();
        Sanctum::actingAs($this->client);
        $documentId = $this->upload($booking, 'identity')->assertCreated()->json('data.document.id');

        Document::query()->findOrFail($documentId)->delete();

        $this->getJson("/api/bookings/{$booking->id}/dossier")
            ->assertOk()
            ->assertJsonPath('data.received', 0)
            ->assertJsonPath('data.pieces.0.received', false);
    }

    public function test_the_upload_accepts_only_the_piece_types_and_the_pieces_of_the_list(): void
    {
        $booking = $this->application();
        Sanctum::actingAs($this->client);

        $this->upload($booking, 'identity', UploadedFile::fake()->create('notes.txt', 2, 'text/plain'))
            ->assertStatus(422)->assertJsonValidationErrors('file');
        $this->upload($booking, 'identity', UploadedFile::fake()->create('lourd.pdf', 10241, 'application/pdf'))
            ->assertStatus(422)->assertJsonValidationErrors('file');
        // Une pièce d'une offre n'est pas dans la liste d'une candidature ; une valeur hors de l'enum non plus.
        $this->upload($booking, 'proof_of_funds')->assertNotFound()->assertJsonPath('code', 'booking.dossier_piece_not_found');
        $this->upload($booking, 'passport')->assertNotFound();

        $this->assertSame(0, Document::query()->count());
    }

    public function test_ac4_a_stay_has_no_dossier(): void
    {
        $stay = Booking::factory()->create(['property_id' => $this->daily->id, 'agency_id' => $this->daily->agency_id, 'customer_id' => $this->customer->id]);

        Sanctum::actingAs($this->agent);
        $this->getJson("/api/bookings/{$stay->id}/dossier")->assertNotFound()->assertJsonPath('code', 'booking.dossier_not_found');
        $this->upload($stay, 'identity')->assertNotFound()->assertJsonPath('code', 'booking.dossier_not_found');
        $this->postJson("/api/bookings/{$stay->id}/dossier/identity/request")->assertNotFound()->assertJsonPath('code', 'booking.dossier_not_found');
        $this->assertSame(0, BookingDossierItem::query()->count());
    }

    public function test_ac4_a_closed_application_keeps_its_dossier_readable_and_refuses_uploads(): void
    {
        $booking = $this->application();
        Sanctum::actingAs($this->client);
        $this->upload($booking, 'identity')->assertCreated();

        foreach ([BookingStatus::Rejected, BookingStatus::Cancelled, BookingStatus::Expired] as $status) {
            $booking->forceFill(['status' => $status])->save();

            Sanctum::actingAs($this->client);
            $this->upload($booking, 'payslips')->assertStatus(422)->assertJsonPath('code', 'booking.dossier_closed');
            $this->getJson("/api/bookings/{$booking->id}/dossier")->assertOk()->assertJsonPath('data.received', 1);
        }

        $this->assertSame(1, Document::query()->count());
    }

    public function test_guarantor_pieces_are_added_and_only_a_missing_piece_is_removed(): void
    {
        $booking = $this->application();
        $service = app(BookingDossierService::class);

        $service->addPieces($booking, DossierPiece::forGuarantor());
        $this->assertSame(5, $booking->dossierItems()->count());

        Sanctum::actingAs($this->client);
        $this->upload($booking, 'guarantor_identity')->assertCreated();
        // Une pièce dont le document a été supprimé est manquante : elle se retire.
        $supprime = $this->upload($booking, 'guarantor_commitment')->assertCreated()->json('data.document.id');
        Document::query()->findOrFail($supprime)->delete();

        $service->removePieces($booking, DossierPiece::forGuarantor());
        $this->assertSame(
            ['identity', 'payslips', 'employment_certificate', 'guarantor_identity'],
            $service->items($booking)->pluck('piece')->map->value->all(),
        );
    }
}

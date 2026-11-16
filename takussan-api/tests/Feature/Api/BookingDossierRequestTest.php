<?php

namespace Tests\Feature\Api;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use App\Services\Notifications\NotificationRenderer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2872 (ADR-0110 § 2) — « Demander » une pièce manquante : le client est prévenu par
 * `booking.dossier_piece_requested` (référence, bien, pièce codée), au plus une fois par pièce et
 * par 24 h (429), jamais pour une pièce reçue (422). Le geste est celui du personnel de l'agence.
 */
class BookingDossierRequestTest extends TestCase
{
    use RefreshDatabase;

    private User $agent;

    private User $client;

    private Customer $customer;

    private Property $monthly;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-11-15 10:00:00');

        $agency = Agency::factory()->create();
        $this->agent = User::factory()->withAgentProfile($agency)->create();
        $this->client = User::factory()->create();
        $this->customer = Customer::factory()->create(['agency_id' => $agency->id, 'user_id' => $this->client->id]);
        $this->monthly = Property::factory()->published()->create([
            'agency_id' => $agency->id, 'currency' => Currency::XOF,
            'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly, 'price' => '300000',
        ]);
    }

    private function application(?Customer $customer = null): Booking
    {
        Sanctum::actingAs($this->agent);

        return Booking::query()->findOrFail($this->postJson('/api/bookings', [
            'kind' => 'application', 'property_id' => $this->monthly->id,
            'customer_id' => ($customer ?? $this->customer)->id, 'start_date' => '2026-12-01',
        ])->assertCreated()->json('data.id'));
    }

    private function sent(): int
    {
        return AppNotification::query()
            ->where('user_id', $this->client->id)
            ->where('code', NotificationCode::BookingDossierPieceRequested->value)
            ->count();
    }

    public function test_ac3_requesting_a_piece_notifies_the_customer_then_429_within_24_hours(): void
    {
        $booking = $this->application();

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/bookings/{$booking->id}/dossier/employment_certificate/request")
            ->assertOk()
            ->assertJsonPath('data.piece', 'employment_certificate')
            ->assertJsonPath('data.requested_at', '2026-11-15T10:00:00+00:00')
            ->assertJsonPath('data.customer_notified', true);

        $avis = AppNotification::query()->where('user_id', $this->client->id)
            ->where('code', NotificationCode::BookingDossierPieceRequested->value)->sole();
        $this->assertSame('employment_certificate', $avis->params['piece']);
        $this->assertSame($booking->reference_number, $avis->params['reference']);
        $this->assertEquals(['kind' => 'booking', 'id' => $booking->id], array_intersect_key((array) $avis->target, ['kind' => 1, 'id' => 1]));

        $this->travel(23)->hours();
        $this->postJson("/api/bookings/{$booking->id}/dossier/employment_certificate/request")
            ->assertStatus(429)->assertJsonPath('code', 'booking.dossier_request_throttled');
        $this->assertSame(1, $this->sent());

        // Une autre pièce n'est pas bornée par la première.
        $this->postJson("/api/bookings/{$booking->id}/dossier/payslips/request")->assertOk();

        $this->travel(2)->hours();
        $this->postJson("/api/bookings/{$booking->id}/dossier/employment_certificate/request")->assertOk();
        $this->assertSame(3, $this->sent());
    }

    public function test_the_piece_is_rendered_by_its_label_never_by_its_code(): void
    {
        $code = NotificationCode::BookingDossierPieceRequested;
        $this->assertSame(NotificationCode::PARAM_DOSSIER_PIECE, $code->params()['piece']);

        $texte = app(NotificationRenderer::class)->format($code, ['reference' => 'BK-1', 'property' => 'Villa', 'piece' => 'employment_certificate'], 'fr', 'Africa/Dakar');
        $this->assertSame('attestation de travail', $texte['piece']);
        $this->assertSame('employment certificate', app(NotificationRenderer::class)->format($code, ['piece' => 'employment_certificate'], 'en', 'UTC')['piece']);
    }

    public function test_a_received_piece_is_not_requested(): void
    {
        $booking = $this->application();
        Sanctum::actingAs($this->client);
        $this->post("/api/bookings/{$booking->id}/dossier/identity/document", [
            'file' => UploadedFile::fake()->create('cni.pdf', 12, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated();

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/bookings/{$booking->id}/dossier/identity/request")
            ->assertStatus(422)->assertJsonPath('code', 'booking.dossier_piece_received');
        $this->assertSame(0, $this->sent());
    }

    public function test_only_the_staff_requests_and_never_on_a_closed_request(): void
    {
        $booking = $this->application();

        Sanctum::actingAs($this->client);
        $this->postJson("/api/bookings/{$booking->id}/dossier/payslips/request")->assertForbidden();

        $booking->forceFill(['status' => BookingStatus::Rejected])->save();
        Sanctum::actingAs($this->agent);
        $this->postJson("/api/bookings/{$booking->id}/dossier/payslips/request")
            ->assertStatus(422)->assertJsonPath('code', 'booking.dossier_closed');
        $this->assertSame(0, $this->sent());
    }

    public function test_a_customer_without_account_is_not_notified_but_the_request_is_dated(): void
    {
        $sansCompte = Customer::factory()->create(['agency_id' => $this->monthly->agency_id, 'user_id' => null]);
        $booking = $this->application($sansCompte);

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/bookings/{$booking->id}/dossier/payslips/request")
            ->assertOk()->assertJsonPath('data.customer_notified', false);

        $this->assertNotNull($booking->dossierItems()->where('piece', 'payslips')->value('requested_at'));
        $this->assertSame(0, AppNotification::query()->where('code', NotificationCode::BookingDossierPieceRequested->value)->count());
    }
}

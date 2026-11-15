<?php

namespace Tests\Feature\Api;

use App\Domain\Notifications\NotificationCode;
use App\Jobs\ExpireBookings;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\BookingCounterOffer;
use App\Models\Customer;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\CounterOfferStatus;
use App\Models\Enums\Currency;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use App\Services\Notifications\NotificationRenderer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-2873 (ADR-0110 § 5) — la contre-offre sur une offre d'achat : proposée par le personnel de
 * l'agence du bien, acceptée (l'offre prend son montant et passe `confirmed`) ou déclinée (l'offre
 * reste en attente à son montant d'origine) par le client, remplacée par une plus récente, ou échue
 * par la tâche d'expiration. Le statut de la réservation ne change pas pendant la contre-offre :
 * `awaiting` le dit.
 */
class BookingCounterOfferTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $client;

    private Customer $customer;

    private Property $sale;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-15 10:00:00');

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->withAgentProfile($this->agency)->create();
        $this->client = User::factory()->create();
        $this->customer = Customer::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->client->id]);
        $this->sale = Property::factory()->published()->create([
            'agency_id' => $this->agency->id, 'currency' => Currency::XOF,
            'contract_type' => ContractType::Sale, 'rent_period' => null, 'price' => '95000000',
        ]);
    }

    private function offer(): Booking
    {
        Sanctum::actingAs($this->agent);
        $id = $this->postJson('/api/bookings', [
            'kind' => 'offer', 'property_id' => $this->sale->id,
            'customer_id' => $this->customer->id, 'total_amount' => 85000000,
        ])->assertCreated()->json('data.id');

        return Booking::query()->findOrFail($id);
    }

    /** @param  array<string, mixed>  $data */
    private function propose(Booking $booking, array $data = []): TestResponse
    {
        Sanctum::actingAs($this->agent);

        return $this->postJson("/api/bookings/{$booking->id}/counter-offers", $data + ['amount' => 90000000]);
    }

    private function answer(Booking $booking, int $counterOfferId, string $answer, ?User $as = null): TestResponse
    {
        Sanctum::actingAs($as ?? $this->client);

        return $this->postJson("/api/bookings/{$booking->id}/counter-offers/{$counterOfferId}/{$answer}");
    }

    private function notifications(User $user, NotificationCode $code): Collection
    {
        return AppNotification::query()->where('user_id', $user->id)->where('code', $code->value)->get();
    }

    public function test_ac1_the_agent_counters_and_the_customer_is_notified(): void
    {
        $booking = $this->offer();

        $id = $this->propose($booking, ['message' => 'Le vendeur descend à 90 M.'])
            ->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.total_amount', 85000000)
            ->assertJsonPath('data.awaiting', 'customer')
            ->assertJsonPath('data.counter_offer.amount', 90000000)
            ->assertJsonPath('data.counter_offer.message', 'Le vendeur descend à 90 M.')
            // J+3 par défaut.
            ->assertJsonPath('data.counter_offer.valid_until', '2026-11-18')
            ->assertJsonPath('data.counter_offer.status', 'pending')
            ->json('data.counter_offer.id');

        $avis = $this->notifications($this->client, NotificationCode::BookingCounterOfferReceived)->sole();
        $this->assertSame($booking->reference_number, $avis->params['reference']);
        $this->assertSame('2026-11-18', $avis->params['valid_until']);
        $this->assertEquals(90000000, $avis->params['amount']['amount']);

        // Le client lit la même chose dans sa réservation.
        Sanctum::actingAs($this->client);
        $this->getJson("/api/bookings/{$booking->id}")->assertOk()
            ->assertJsonPath('data.awaiting', 'customer')
            ->assertJsonPath('data.counter_offer.id', $id);

        // Entrée au journal de la réservation.
        $this->assertTrue(Activity::query()->where('subject_type', Booking::class)->where('subject_id', $booking->id)
            ->where('event', 'counter_offer_proposed')->exists());
    }

    public function test_ac2_the_customer_accepts_the_offer_is_confirmed_at_the_new_amount(): void
    {
        $booking = $this->offer();
        $id = $this->propose($booking)->assertCreated()->json('data.counter_offer.id');

        $this->answer($booking, $id, 'accept')->assertOk()
            ->assertJsonPath('data.status', 'confirmed')
            ->assertJsonPath('data.total_amount', 90000000)
            ->assertJsonPath('data.counter_offer.status', 'accepted')
            ->assertJsonPath('data.awaiting', null);

        $booking->refresh();
        $this->assertSame(BookingStatus::Confirmed, $booking->status);
        $this->assertNotNull($booking->confirmed_at);
        $this->assertSame('90000000.00', (string) $booking->total_amount);

        // L'agence est prévenue de la réponse ; le client, de la confirmation (chemin d'acceptation).
        $avis = $this->notifications($this->agent, NotificationCode::BookingCounterOfferAnswered)->sole();
        $this->assertSame('accepted', $avis->params['answer']);
        $this->assertSame(1, $this->notifications($this->client, NotificationCode::BookingConfirmed)->count());
        $this->assertStringContainsString(
            'a accepté votre contre-proposition',
            app(NotificationRenderer::class)->render(NotificationCode::BookingCounterOfferAnswered, $avis->params, 'fr'),
        );
    }

    public function test_ac3_the_customer_declines_the_offer_stays_pending_at_its_amount(): void
    {
        $booking = $this->offer();
        $id = $this->propose($booking)->assertCreated()->json('data.counter_offer.id');

        $this->answer($booking, $id, 'decline')->assertOk()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.total_amount', 85000000)
            ->assertJsonPath('data.counter_offer.status', 'declined')
            ->assertJsonPath('data.awaiting', 'agency');

        $this->assertSame('85000000.00', (string) $booking->refresh()->total_amount);
        $this->assertSame(BookingStatus::Pending, $booking->status);
        $this->assertSame('declined', $this->notifications($this->agent, NotificationCode::BookingCounterOfferAnswered)->sole()->params['answer']);

        // Déclinée, elle ne s'accepte plus.
        $this->answer($booking, $id, 'accept')->assertStatus(422)->assertJsonPath('code', 'booking.counter_offer_not_open');
    }

    public function test_a_new_counter_offer_supersedes_the_pending_one(): void
    {
        $booking = $this->offer();
        $premiere = $this->propose($booking)->assertCreated()->json('data.counter_offer.id');
        $seconde = $this->propose($booking, ['amount' => 88000000])->assertCreated()
            ->assertJsonPath('data.counter_offer.amount', 88000000)
            ->json('data.counter_offer.id');

        $this->assertSame(CounterOfferStatus::Superseded, BookingCounterOffer::query()->findOrFail($premiere)->status);
        $this->assertSame(CounterOfferStatus::Pending, BookingCounterOffer::query()->findOrFail($seconde)->status);
        $this->answer($booking, $premiere, 'accept')->assertStatus(422)->assertJsonPath('code', 'booking.counter_offer_not_open');
        $this->answer($booking, $seconde, 'accept')->assertOk()->assertJsonPath('data.total_amount', 88000000);
    }

    public function test_ac5_an_overdue_counter_offer_expires_by_the_task_and_cannot_be_accepted(): void
    {
        $booking = $this->offer();
        $id = $this->propose($booking, ['valid_until' => '2026-11-16'])->assertCreated()->json('data.counter_offer.id');

        // Le dernier jour compte jusqu'au soir (Dakar).
        $this->travelTo('2026-11-16 23:00:00');
        Sanctum::actingAs($this->client);
        $this->getJson("/api/bookings/{$booking->id}")->assertJsonPath('data.awaiting', 'customer');

        $this->travelTo('2026-11-17 09:00:00');
        // Échue avant même le passage de la tâche.
        $this->answer($booking, $id, 'accept')->assertStatus(422)->assertJsonPath('code', 'booking.counter_offer_expired');

        (new ExpireBookings)->handle();

        $this->assertSame(CounterOfferStatus::Expired, BookingCounterOffer::query()->findOrFail($id)->status);
        // L'offre n'est pas touchée.
        $this->assertSame(BookingStatus::Pending, $booking->refresh()->status);
        $this->assertSame('85000000.00', (string) $booking->total_amount);
        $this->assertTrue(Activity::query()->where('subject_id', $booking->id)->where('event', 'counter_offer_expired')->exists());

        $this->answer($booking, $id, 'accept')->assertStatus(422)->assertJsonPath('code', 'booking.counter_offer_expired');
        $this->getJson("/api/bookings/{$booking->id}")
            ->assertJsonPath('data.awaiting', 'agency')
            ->assertJsonPath('data.counter_offer.status', 'expired');
    }

    public function test_ac4_counter_offer_on_an_application_or_a_stay_is_refused(): void
    {
        $monthly = Property::factory()->published()->create([
            'agency_id' => $this->agency->id, 'currency' => Currency::XOF,
            'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly, 'price' => '300000',
        ]);
        Sanctum::actingAs($this->agent);
        $application = Booking::query()->findOrFail($this->postJson('/api/bookings', [
            'kind' => 'application', 'property_id' => $monthly->id,
            'customer_id' => $this->customer->id, 'start_date' => '2026-12-01',
        ])->assertCreated()->json('data.id'));
        $stay = Booking::factory()->create([
            'property_id' => $monthly->id, 'agency_id' => $this->agency->id, 'customer_id' => $this->customer->id,
            'kind' => BookingKind::Stay, 'status' => BookingStatus::Pending,
        ]);

        $this->propose($application)->assertStatus(422)->assertJsonPath('code', 'booking.counter_offer_not_allowed');
        $this->propose($stay)->assertStatus(422)->assertJsonPath('code', 'booking.counter_offer_not_allowed');
        $this->assertSame(0, BookingCounterOffer::query()->count());

        // Une offre qui n'est plus en attente non plus.
        $offer = $this->offer();
        $offer->update(['status' => BookingStatus::Rejected]);
        $this->propose($offer)->assertStatus(422)->assertJsonPath('code', 'booking.counter_offer_not_allowed');
    }

    public function test_only_the_customer_answers_and_only_the_agency_staff_counters(): void
    {
        $booking = $this->offer();
        $id = $this->propose($booking)->assertCreated()->json('data.counter_offer.id');

        $autreClient = User::factory()->create();
        Customer::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $autreClient->id]);
        $this->answer($booking, $id, 'accept', $autreClient)->assertForbidden();
        $this->answer($booking, $id, 'decline', $autreClient)->assertForbidden();
        // L'agent ne répond pas à la place du client.
        $this->answer($booking, $id, 'accept', $this->agent)->assertForbidden();

        // Le client ne contre-propose pas ; le personnel d'une autre agence non plus.
        Sanctum::actingAs($this->client);
        $this->postJson("/api/bookings/{$booking->id}/counter-offers", ['amount' => 80000000])->assertForbidden();
        $ailleurs = User::factory()->withAgentProfile(Agency::factory()->create())->create();
        Sanctum::actingAs($ailleurs);
        $this->postJson("/api/bookings/{$booking->id}/counter-offers", ['amount' => 80000000])->assertForbidden();

        $this->assertSame(CounterOfferStatus::Pending, BookingCounterOffer::query()->findOrFail($id)->status);
    }

    public function test_a_counter_offer_is_answered_only_through_its_own_booking(): void
    {
        $booking = $this->offer();
        $id = $this->propose($booking)->assertCreated()->json('data.counter_offer.id');
        $autre = $this->offer();

        // Le client de `$autre` est le même : seul le lien réservation ↔ contre-offre l'arrête.
        $this->answer($autre, $id, 'accept')->assertNotFound();
        $this->assertSame(CounterOfferStatus::Pending, BookingCounterOffer::query()->findOrFail($id)->status);
    }

    public function test_the_amount_and_the_validity_are_bounded(): void
    {
        $booking = $this->offer();

        $this->propose($booking, ['amount' => 0])->assertStatus(422)->assertJsonValidationErrors('amount');
        $this->propose($booking, ['amount' => 90000000.5])->assertStatus(422)->assertJsonValidationErrors('amount');
        $this->propose($booking, ['valid_until' => '2026-12-16'])->assertStatus(422)->assertJsonValidationErrors('valid_until');
        $this->propose($booking, ['valid_until' => '2026-11-14'])->assertStatus(422)->assertJsonValidationErrors('valid_until');
        $this->propose($booking, ['message' => str_repeat('a', 501)])->assertStatus(422)->assertJsonValidationErrors('message');
        $this->propose($booking, ['valid_until' => '2026-12-15'])->assertCreated()->assertJsonPath('data.counter_offer.valid_until', '2026-12-15');
    }

    public function test_the_list_serves_the_counter_offer_and_who_must_act(): void
    {
        $booking = $this->offer();
        $this->propose($booking)->assertCreated();

        Sanctum::actingAs($this->agent);
        $ligne = collect($this->getJson('/api/bookings')->assertOk()->json('data'))->firstWhere('id', $booking->id);
        $this->assertSame('customer', $ligne['awaiting']);
        $this->assertEquals(90000000, $ligne['counter_offer']['amount']);
    }
}

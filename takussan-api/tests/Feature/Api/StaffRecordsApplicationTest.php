<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use App\Services\Booking\PropertyAvailabilityService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2579 (ADR-0102, décision 9 (c)) — le personnel de l'agence du bien enregistre une CANDIDATURE
 * à une location au mois, au nom d'un client de l'agence.
 *
 * Avant : `BookingQuote::for` refusait toute période autre que `daily`/`weekly`
 * (`rent_period_not_bookable`) — la candidature était impossible par `/api/bookings`.
 */
class StaffRecordsApplicationTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $landlord;

    private Property $monthly;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->withAgentProfile($this->agency)->create();
        $this->landlord = User::factory()->withOwnerProfile($this->agency)->create();
        $this->monthly = Property::factory()->published()->create([
            'user_id' => $this->landlord->id,
            'agency_id' => $this->agency->id,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Monthly,
            'price' => '350000',
            'currency' => Currency::XOF,
        ]);
        $this->customer = Customer::factory()->create(['agency_id' => $this->agency->id, 'user_id' => null]);
    }

    /** @param  array<string, mixed>  $extra */
    private function record(User $as, array $extra = []): TestResponse
    {
        Sanctum::actingAs($as);

        return $this->postJson('/api/bookings', array_merge([
            'kind' => 'application',
            'property_id' => $this->monthly->id,
            'customer_id' => $this->customer->id,
            'start_date' => '2026-12-01',
        ], $extra));
    }

    public function test_an_agent_records_an_application_on_a_monthly_rental(): void
    {
        $this->travelTo('2026-11-11 10:00:00');

        $this->record($this->agent)
            ->assertCreated()
            ->assertJsonPath('data.kind', 'application')
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.total_amount', 350000)
            ->assertJsonPath('data.end_date', null)
            ->assertJsonPath('data.start_date', '2026-12-01')
            ->assertJsonPath('data.list_price_at_booking', 350000)
            ->assertJsonPath('data.recorded_by_staff', true)
            ->assertJsonPath('data.created_by.id', $this->agent->id);

        $booking = Booking::query()->sole();
        $this->assertSame(BookingKind::Application, $booking->kind);
        $this->assertSame('350000.00', $booking->total_amount);
        $this->assertNull($booking->deposit_amount);
        $this->assertNull($booking->end_date);
        $this->assertSame($this->customer->id, $booking->customer_id);
    }

    public function test_the_proposed_rent_is_kept_when_given(): void
    {
        $this->travelTo('2026-11-11 10:00:00');

        $this->record($this->agent, ['total_amount' => 320000])->assertCreated();

        $booking = Booking::query()->sole();
        $this->assertSame('320000.00', $booking->total_amount);
        $this->assertSame('350000.00', $booking->list_price_at_booking);
    }

    public function test_an_application_needs_its_entry_date_and_has_no_departure(): void
    {
        $this->travelTo('2026-11-11 10:00:00');

        $this->record($this->agent, ['start_date' => null])->assertStatus(422)->assertJsonValidationErrors(['start_date']);
        $this->record($this->agent, ['end_date' => '2027-01-01'])->assertStatus(422)->assertJsonValidationErrors(['end_date']);
        $this->assertDatabaseCount('bookings', 0);
    }

    public function test_an_application_on_a_property_for_sale_is_a_kind_mismatch(): void
    {
        $this->travelTo('2026-11-11 10:00:00');
        $this->monthly->update(['contract_type' => ContractType::Sale, 'rent_period' => null]);

        $this->record($this->agent)->assertStatus(422)->assertJsonPath('code', 'booking.kind_mismatch');
        $this->assertDatabaseCount('bookings', 0);
    }

    public function test_a_client_or_the_landlord_cannot_record_an_application(): void
    {
        $this->travelTo('2026-11-11 10:00:00');
        $client = User::factory()->create();
        $other = Customer::factory()->create(['user_id' => $client->id]);

        $this->record($client, ['customer_id' => $other->id])->assertForbidden();
        $this->record($client, ['customer_id' => $this->customer->id])->assertForbidden();
        $this->record($this->landlord)->assertForbidden();
        $this->record(User::factory()->withAgentProfile(Agency::factory()->create())->create())->assertForbidden();
        $this->assertDatabaseCount('bookings', 0);
    }

    /**
     * Piège 2 de `takussan-api/CLAUDE.md` — le refus précède la validation : un client qui poste un
     * corps INVALIDE reçoit 403, pas les règles du formulaire ; l'agent qui poste le même corps
     * reçoit 422 (sans quoi un `authorize()` qui refuserait tout le monde rendrait ce test vert).
     */
    public function test_the_refusal_precedes_the_validation(): void
    {
        $this->travelTo('2026-11-11 10:00:00');
        $invalid = ['start_date' => 'pas-une-date', 'end_date' => '2027-01-01', 'guests' => 99];

        $this->record(User::factory()->create(), $invalid)->assertForbidden();
        $this->record($this->agent, $invalid)->assertStatus(422)->assertJsonValidationErrors(['start_date', 'end_date', 'guests']);
    }

    public function test_an_absent_property_gets_the_refusal_of_a_foreign_one(): void
    {
        $this->travelTo('2026-11-11 10:00:00');

        $this->record($this->agent, ['property_id' => 999_999_999])->assertForbidden();
        $this->record($this->agent, ['property_id' => 'abc'])->assertForbidden();
    }

    /**
     * ADR-0102 § Application — une candidature confirmée, même datée (comme celles du tunnel
     * public), ne bloque pas les nuits d'un séjour : seul un séjour occupe le calendrier.
     */
    public function test_a_confirmed_application_does_not_block_the_nights_of_a_stay(): void
    {
        $this->travelTo('2026-11-11 10:00:00');
        Booking::factory()->create([
            'property_id' => $this->monthly->id,
            'agency_id' => $this->agency->id,
            'kind' => BookingKind::Application,
            'status' => BookingStatus::Confirmed,
            'confirmed_at' => now(),
            'start_date' => '2026-12-01',
            'end_date' => '2026-12-31',
        ]);
        $this->monthly->update(['rent_period' => RentPeriod::Daily]);

        app(PropertyAvailabilityService::class)->assertAvailable($this->monthly->refresh(), '2026-12-05', '2026-12-08');
        $this->assertSame([], app(PropertyAvailabilityService::class)->occupiedRanges($this->monthly, now(), now()->addMonths(3)));

        // Le témoin : la même ligne en SÉJOUR, elle, occupe ces nuits.
        Booking::query()->sole()->update(['kind' => BookingKind::Stay]);
        $this->assertCount(1, app(PropertyAvailabilityService::class)->occupiedRanges($this->monthly, now(), now()->addMonths(3)));
    }
}

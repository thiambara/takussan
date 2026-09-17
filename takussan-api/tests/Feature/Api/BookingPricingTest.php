<?php

namespace Tests\Feature\Api;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-530 — `POST /api/bookings` calcule le total et l'acompte depuis le bien et les dates.
 *
 * Avant : le serveur enregistrait le `total_amount` du client, et le tunnel envoyait
 * `prix × nuits` quelle que soit la période du loyer. Les montants s'assertent EN BASE, sur la
 * chaîne `decimal:2` : la ressource les rend en flottant, qui masquerait un arrondi.
 */
class BookingPricingTest extends TestCase
{
    use RefreshDatabase;

    private User $client;

    protected function setUp(): void
    {
        parent::setUp();

        $this->client = User::factory()->create();
        Sanctum::actingAs($this->client);
    }

    private function rental(RentPeriod $period, string $price, Currency $currency = Currency::XOF): Property
    {
        return Property::factory()->create([
            'contract_type' => ContractType::Rent,
            'rent_period' => $period,
            'price' => $price,
            'currency' => $currency,
        ]);
    }

    /** @return array<string,mixed> */
    private function stay(Property $property, int $nights, array $extra = []): array
    {
        return [
            'property_id' => $property->id,
            'start_date' => now()->addDays(2)->toDateString(),
            'end_date' => now()->addDays(2 + $nights)->toDateString(),
        ] + $extra;
    }

    private function onlyBooking(): Booking
    {
        $this->assertDatabaseCount('bookings', 1);

        return Booking::query()->sole();
    }

    public function test_daily_rent_is_price_times_nights_with_a_thirty_percent_deposit(): void
    {
        $property = $this->rental(RentPeriod::Daily, '20000');

        // Le payload du tunnel : aucun montant, aucun `customer_id`.
        $this->postJson('/api/bookings', $this->stay($property, 3))->assertCreated();

        $booking = $this->onlyBooking();
        $this->assertSame('60000.00', $booking->total_amount);
        $this->assertSame('18000.00', $booking->deposit_amount);
    }

    public function test_the_tunnel_payload_resolves_the_customer_of_the_caller(): void
    {
        $property = $this->rental(RentPeriod::Daily, '20000');

        $this->postJson('/api/bookings', $this->stay($property, 1))->assertCreated();

        $customer = Customer::query()->where('user_id', $this->client->id)->sole();
        $this->assertSame($customer->id, $this->onlyBooking()->customer_id);
    }

    public function test_weekly_rent_is_prorated_by_seven(): void
    {
        $property = $this->rental(RentPeriod::Weekly, '70000');

        $this->postJson('/api/bookings', $this->stay($property, 10))->assertCreated();

        $booking = $this->onlyBooking();
        $this->assertSame('100000.00', $booking->total_amount);
        $this->assertSame('30000.00', $booking->deposit_amount);
    }

    public function test_xof_amounts_round_half_up_to_the_franc(): void
    {
        // 50 000 × 3 / 7 = 21 428,57… → 21 429 ; 30 % = 6 428,7 → 6 429.
        $property = $this->rental(RentPeriod::Weekly, '50000');

        $this->postJson('/api/bookings', $this->stay($property, 3))->assertCreated();

        $booking = $this->onlyBooking();
        $this->assertSame('21429.00', $booking->total_amount);
        $this->assertSame('6429.00', $booking->deposit_amount);
    }

    public function test_a_currency_with_cents_keeps_them(): void
    {
        // 99,99 × 3 = 299,97 ; 30 % = 89,991 → 89,99.
        $property = $this->rental(RentPeriod::Daily, '99.99', Currency::EUR);

        $this->postJson('/api/bookings', $this->stay($property, 3))->assertCreated();

        $booking = $this->onlyBooking();
        $this->assertSame('299.97', $booking->total_amount);
        $this->assertSame('89.99', $booking->deposit_amount);
        // Vérification adverse : la réservation était enregistrée en XOF (le défaut du service),
        // soit 299,97 F CFA pour un séjour à 299,97 €.
        $this->assertSame(Currency::EUR, $booking->currency);
    }

    /** Vérification adverse — la devise suit la même règle que les montants : refusée si elle diffère. */
    public function test_a_client_currency_other_than_the_property_one_creates_nothing(): void
    {
        $property = $this->rental(RentPeriod::Daily, '20000');

        $this->postJson('/api/bookings', $this->stay($property, 3, [
            'total_amount' => 60000,
            'currency' => Currency::USD->value,
        ]))->assertStatus(422)->assertJsonValidationErrors(['currency']);

        $this->assertDatabaseCount('bookings', 0);
    }

    public function test_the_property_currency_sent_back_is_accepted(): void
    {
        $property = $this->rental(RentPeriod::Daily, '20000');

        $this->postJson('/api/bookings', $this->stay($property, 3, ['currency' => Currency::XOF->value]))
            ->assertCreated();

        $this->assertSame(Currency::XOF, $this->onlyBooking()->currency);
    }

    /**
     * Vérification adverse — `end_date` n'a pas de plafond : un séjour jusqu'en 9999 au prix
     * maximal débordait l'entier à l'acompte et rendait une 500.
     */
    public function test_a_stay_whose_total_overflows_the_column_is_refused(): void
    {
        $property = $this->rental(RentPeriod::Daily, '999999999.99');

        $this->postJson('/api/bookings', [
            'property_id' => $property->id,
            'start_date' => '2026-10-01',
            'end_date' => '9999-12-31',
        ])->assertStatus(422)->assertJsonValidationErrors(['end_date']);

        $this->assertDatabaseCount('bookings', 0);
    }

    public function test_the_largest_stay_the_column_holds_is_accepted(): void
    {
        // 999 999 999 999 F est le plafond ; 1000 nuits à 999 999 999 F y tiennent.
        $property = $this->rental(RentPeriod::Daily, '999999999');

        $this->postJson('/api/bookings', $this->stay($property, 1000))->assertCreated();

        $this->assertSame('999999999000.00', $this->onlyBooking()->total_amount);
    }

    public static function longTermPeriods(): array
    {
        return [
            'monthly' => [RentPeriod::Monthly],
            'yearly' => [RentPeriod::Yearly],
        ];
    }

    #[DataProvider('longTermPeriods')]
    public function test_a_long_term_rental_is_refused_and_never_priced_per_night(RentPeriod $period): void
    {
        $property = $this->rental($period, '250000');

        $this->postJson('/api/bookings', $this->stay($property, 10, ['total_amount' => 2500000]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['property_id']);

        $this->assertDatabaseCount('bookings', 0);
    }

    public function test_a_short_stay_without_dates_is_refused(): void
    {
        $property = $this->rental(RentPeriod::Daily, '20000');

        $this->postJson('/api/bookings', ['property_id' => $property->id])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['end_date']);

        $this->assertDatabaseCount('bookings', 0);
    }

    /**
     * Vérification adverse — l'API acceptait une arrivée PASSÉE (201), que seul le sélecteur de
     * dates empêchait. Même règle que `BookingRequestPublicPropertyRequest` : `after_or_equal:today`,
     * jugé dans le fuseau de l'application (UTC, qui est aussi l'heure de Dakar, sans heure d'été).
     */
    public function test_a_stay_starting_in_the_past_is_refused(): void
    {
        $property = $this->rental(RentPeriod::Daily, '20000');

        $this->withHeader('Accept-Language', 'fr')->postJson('/api/bookings', [
            'property_id' => $property->id,
            'start_date' => now()->subDay()->toDateString(),
            'end_date' => now()->addDays(2)->toDateString(),
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['start_date' => "La date d'arrivée ne peut pas être passée."]);

        $this->assertDatabaseCount('bookings', 0);
    }

    public function test_a_stay_starting_today_is_accepted(): void
    {
        $property = $this->rental(RentPeriod::Daily, '20000');

        $this->postJson('/api/bookings', [
            'property_id' => $property->id,
            'start_date' => now()->toDateString(),
            'end_date' => now()->addDays(2)->toDateString(),
        ])->assertCreated();

        $this->assertSame('40000.00', $this->onlyBooking()->total_amount);
    }

    /** AC3 — le montant client incohérent ne crée rien, ni à son montant ni à un autre. */
    public function test_an_inconsistent_client_total_creates_nothing(): void
    {
        $property = $this->rental(RentPeriod::Daily, '20000');

        $this->postJson('/api/bookings', $this->stay($property, 3, ['total_amount' => 1]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['total_amount']);

        $this->assertDatabaseCount('bookings', 0);
    }

    public function test_an_inconsistent_client_deposit_creates_nothing(): void
    {
        $property = $this->rental(RentPeriod::Daily, '20000');

        $this->postJson('/api/bookings', $this->stay($property, 3, ['deposit_amount' => 60000]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['deposit_amount']);

        $this->assertDatabaseCount('bookings', 0);
    }

    public function test_a_consistent_client_total_is_accepted(): void
    {
        $property = $this->rental(RentPeriod::Daily, '20000');

        $this->postJson('/api/bookings', $this->stay($property, 3, [
            'total_amount' => '60000.00',
            'deposit_amount' => 18000,
        ]))->assertCreated();

        $this->assertSame('60000.00', $this->onlyBooking()->total_amount);
    }

    public function test_a_sale_is_priced_at_the_listed_price(): void
    {
        $property = Property::factory()->create([
            'contract_type' => ContractType::Sale,
            'price' => '45000000',
        ]);

        $this->postJson('/api/bookings', ['property_id' => $property->id])->assertCreated();

        $booking = $this->onlyBooking();
        $this->assertSame('45000000.00', $booking->total_amount);
        $this->assertSame('13500000.00', $booking->deposit_amount);
    }

    /**
     * Vérification adverse — un prix XOF à centimes donnait un total à centimes (12 345,67) et un
     * acompte au franc : le total s'arrondit désormais comme l'acompte.
     */
    public function test_a_sale_total_is_rounded_to_the_franc_like_its_deposit(): void
    {
        $property = Property::factory()->create([
            'contract_type' => ContractType::Sale,
            'price' => '12345.67',
            'currency' => Currency::XOF,
        ]);

        $this->postJson('/api/bookings', ['property_id' => $property->id])->assertCreated();

        $booking = $this->onlyBooking();
        $this->assertSame('12346.00', $booking->total_amount);
        $this->assertSame('3704.00', $booking->deposit_amount);
    }
}

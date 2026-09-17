<?php

namespace Tests\Feature\Public;

use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PropertyBookingRequestTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_returns_401(): void
    {
        $property = Property::factory()->published()->create();

        $this->postJson("/api/public/properties/{$property->slug}/booking-request", [
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
            'guests' => 2,
        ])->assertStatus(401);
    }

    public function test_authenticated_creates_booking_and_customer(): void
    {
        $property = Property::factory()->published()->create([
            'price' => 50_000,
            'currency' => Currency::XOF,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Daily,
        ]);
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $response = $this->postJson("/api/public/properties/{$property->slug}/booking-request", [
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(4)->toDateString(),
            'guests' => 2,
            'message' => 'Family vacation',
        ]);

        $response->assertCreated()->assertJsonStructure([
            'data' => ['id', 'property_id', 'status', 'total_amount', 'start_date', 'end_date'],
        ]);

        $this->assertDatabaseHas('bookings', [
            'property_id' => $property->id,
            'status' => BookingStatus::Pending->value,
            'total_amount' => 150000,
        ]);
        $this->assertDatabaseHas('customers', ['user_id' => $user->id]);
    }

    /**
     * TCK-535 — même règle que le tunnel (TCK-530, `BookingPricingTest`) : ce calcul-ci rendait le
     * prix SEUL pour toute période autre que `daily`, et aucun acompte.
     */
    public function test_weekly_rent_is_prorated_by_seven_with_a_deposit(): void
    {
        $property = Property::factory()->published()->create([
            'price' => 50_000,
            'currency' => Currency::XOF,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Weekly,
        ]);
        Sanctum::actingAs(User::factory()->create());

        $this->postJson("/api/public/properties/{$property->slug}/booking-request", [
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(4)->toDateString(),
            'guests' => 2,
        ])->assertCreated();

        // 50 000 × 3 / 7 = 21 428,57… → 21 429 ; 30 % = 6 428,7 → 6 429.
        $booking = Booking::query()->sole();
        $this->assertSame('21429.00', $booking->total_amount);
        $this->assertSame('6429.00', $booking->deposit_amount);
    }

    public function test_daily_rent_stores_the_same_amounts_as_the_tunnel(): void
    {
        $property = Property::factory()->published()->create([
            'price' => 20_000,
            'currency' => Currency::XOF,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Daily,
        ]);
        Sanctum::actingAs(User::factory()->create());

        $this->postJson("/api/public/properties/{$property->slug}/booking-request", [
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(4)->toDateString(),
            'guests' => 1,
        ])->assertCreated();

        $booking = Booking::query()->sole();
        $this->assertSame('60000.00', $booking->total_amount);
        $this->assertSame('18000.00', $booking->deposit_amount);
    }

    public static function longTermPeriods(): array
    {
        return [
            'monthly' => [RentPeriod::Monthly],
            'yearly' => [RentPeriod::Yearly],
        ];
    }

    /**
     * TCK-535 (AC2 amendé) — « Postuler » (TCK-165) poste ici pour un loyer au mois ou à l'année :
     * la candidature reste possible, au montant d'UN loyer, jamais prix × nuits, et sans acompte.
     */
    #[DataProvider('longTermPeriods')]
    public function test_a_long_term_application_is_priced_at_one_rent_never_per_night(RentPeriod $period): void
    {
        $property = Property::factory()->published()->create([
            'price' => 250_000,
            'currency' => Currency::XOF,
            'contract_type' => ContractType::Rent,
            'rent_period' => $period,
        ]);
        Sanctum::actingAs(User::factory()->create());

        $this->postJson("/api/public/properties/{$property->slug}/booking-request", [
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(11)->toDateString(),
            'guests' => 1,
        ])->assertCreated();

        $booking = Booking::query()->sole();
        $this->assertSame('250000.00', $booking->total_amount);
        $this->assertNotSame('2500000.00', $booking->total_amount);
        $this->assertNull($booking->deposit_amount);
    }

    /**
     * Vérification adverse de TCK-535 — le propriétaire réservait (ou faisait une offre sur) son
     * propre bien par cet endpoint (201), quand `POST /api/bookings` le refuse (403).
     */
    public function test_the_owner_cannot_request_their_own_property(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->published()->create([
            'user_id' => $owner->id,
            'price' => 20_000,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Daily,
        ]);
        Sanctum::actingAs($owner);

        $this->postJson("/api/public/properties/{$property->slug}/booking-request", [
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(2)->toDateString(),
            'guests' => 1,
        ])->assertForbidden();

        $this->assertDatabaseCount('bookings', 0);
        $this->assertDatabaseMissing('customers', ['user_id' => $owner->id]);
    }

    /**
     * Vérification adverse de TCK-535 — un refus du calcul ne laisse pas de fiche client derrière
     * lui : `BookingQuote` tourne avant `findOrCreateFromUser()`.
     */
    public function test_a_refused_quote_leaves_no_orphan_customer(): void
    {
        $property = Property::factory()->published()->create([
            'price' => '999999999.99',
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Daily,
        ]);
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson("/api/public/properties/{$property->slug}/booking-request", [
            'start_date' => now()->toDateString(),
            'end_date' => '9999-12-31',
            'guests' => 1,
        ])->assertStatus(422)->assertJsonValidationErrors(['end_date']);

        $this->assertDatabaseCount('bookings', 0);
        $this->assertDatabaseMissing('customers', ['user_id' => $user->id]);
    }

    /**
     * TCK-535 AC1, vérification adverse — la fiche et le tunnel, appelés POUR DE VRAI sur le même
     * bien et les mêmes dates, enregistrent le même montant. Semaine avec reste, en EUR.
     */
    public function test_the_property_page_and_the_tunnel_store_the_same_amounts(): void
    {
        $property = Property::factory()->published()->create([
            'price' => '19.99',
            'currency' => Currency::EUR,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Weekly,
        ]);
        $dates = [
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(4)->toDateString(),
        ];
        Sanctum::actingAs(User::factory()->create());

        $this->postJson("/api/public/properties/{$property->slug}/booking-request", $dates + ['guests' => 1])
            ->assertCreated();
        $this->postJson('/api/bookings', $dates + ['property_id' => $property->id])->assertCreated();

        $rows = Booking::query()->orderBy('id')->get(['total_amount', 'deposit_amount', 'currency'])
            ->map(fn (Booking $b) => [$b->total_amount, $b->deposit_amount, $b->currency?->value])
            ->all();
        // 19,99 × 3 / 7 = 8,567… → 8,57 ; 30 % = 2,571 → 2,57.
        $this->assertSame([['8.57', '2.57', 'EUR'], ['8.57', '2.57', 'EUR']], $rows);
    }

    public function test_end_date_before_start_returns_422(): void
    {
        $property = Property::factory()->published()->create([
            'contract_type' => ContractType::Rent,
        ]);
        Sanctum::actingAs(User::factory()->create());

        $this->postJson("/api/public/properties/{$property->slug}/booking-request", [
            'start_date' => now()->addDays(3)->toDateString(),
            'end_date' => now()->addDay()->toDateString(),
            'guests' => 1,
        ])->assertUnprocessable();
    }

    /**
     * Vérification adverse de TCK-535 — les refus de dates arrivent dans la langue de l'appelant.
     * Ils rendaient l'anglais de Laravel (`validation.php` ne porte ni `after` ni
     * `after_or_equal`), affiché tel quel sur une fiche en français.
     */
    public function test_date_refusals_are_in_the_caller_language(): void
    {
        $property = Property::factory()->published()->create([
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Daily,
        ]);
        Sanctum::actingAs(User::factory()->create());

        $this->withHeader('Accept-Language', 'fr')
            ->postJson("/api/public/properties/{$property->slug}/booking-request", [
                'start_date' => now()->subDay()->toDateString(),
                'end_date' => now()->subDays(2)->toDateString(),
                'guests' => 1,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors([
                'start_date' => "La date d'arrivée ne peut pas être passée.",
                'end_date' => "La date de départ doit suivre la date d'arrivée.",
            ]);

        $this->assertDatabaseCount('bookings', 0);
    }

    public function test_sale_property_creates_offer_booking(): void
    {
        // TCK-176 — the modal becomes a purchase-offer form when the property
        // is for sale; never sends start_date / end_date / guests.
        $property = Property::factory()->published()->create([
            'price' => 121_000_000,
            'currency' => Currency::XOF,
            'contract_type' => ContractType::Sale,
            'rent_period' => null,
        ]);
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $expiresAt = now()->addDays(7)->toDateString();
        $response = $this->postJson("/api/public/properties/{$property->slug}/booking-request", [
            'offer_amount' => 110_000_000,
            'offer_expires_at' => $expiresAt,
            'terms_accepted' => true,
            'message' => 'Best and final.',
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('bookings', [
            'property_id' => $property->id,
            'status' => BookingStatus::Pending->value,
            'total_amount' => 110000000,
            'start_date' => null,
            'end_date' => null,
        ]);
    }

    public function test_sale_property_rejects_legacy_booking_payload(): void
    {
        $property = Property::factory()->published()->create([
            'contract_type' => ContractType::Sale,
            'rent_period' => null,
        ]);
        Sanctum::actingAs(User::factory()->create());

        $this->postJson("/api/public/properties/{$property->slug}/booking-request", [
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
            'guests' => 2,
        ])->assertUnprocessable();
    }

    public function test_unknown_slug_returns_404(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/public/properties/unknown-slug/booking-request', [
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(2)->toDateString(),
            'guests' => 1,
        ])->assertNotFound();
    }
}

<?php

namespace Tests\Feature\Public;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Enums\BookingKind;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2579 (AC7, ADR-0102 §1) — le tunnel public pose la nature à l'écriture : séjour,
 * candidature ou offre, d'après le bien. L'offre retient aussi sa validité et le prix affiché dans
 * leurs colonnes ; `metadata` reste écrit comme avant.
 */
class PublicBookingWritesKindTest extends TestCase
{
    use RefreshDatabase;

    private User $client;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-11 10:00:00');
        $this->client = User::factory()->create();
        Sanctum::actingAs($this->client);
    }

    private function bien(ContractType $contract, ?RentPeriod $period, string $price): Property
    {
        return Property::factory()->published()->create([
            'agency_id' => Agency::factory()->create()->id,
            'contract_type' => $contract,
            'rent_period' => $period,
            'price' => $price,
            'currency' => Currency::XOF,
        ]);
    }

    public function test_a_public_offer_is_an_offer_with_its_terms(): void
    {
        $sale = $this->bien(ContractType::Sale, null, '95000000');

        $this->postJson("/api/public/properties/{$sale->slug}/booking-request", [
            'offer_amount' => 85000000,
            'offer_expires_at' => '2026-11-21',
            'terms_accepted' => true,
        ])->assertCreated()->assertJsonPath('data.kind', 'offer');

        $booking = Booking::query()->sole();
        $this->assertSame(BookingKind::Offer, $booking->kind);
        $this->assertSame('2026-11-21', $booking->offer_expires_at->toDateString());
        $this->assertSame('95000000.00', $booking->list_price_at_booking);
        $this->assertSame('offer', $booking->metadata['kind'], 'metadata reste écrit comme avant');
    }

    public function test_a_public_request_on_a_monthly_rental_is_an_application(): void
    {
        $monthly = $this->bien(ContractType::Rent, RentPeriod::Monthly, '350000');

        $this->postJson("/api/public/properties/{$monthly->slug}/booking-request", [
            'start_date' => '2026-12-01',
            'end_date' => '2027-12-01',
            'guests' => 2,
        ])->assertCreated()->assertJsonPath('data.kind', 'application');

        $booking = Booking::query()->sole();
        $this->assertSame(BookingKind::Application, $booking->kind);
        $this->assertSame('350000.00', $booking->list_price_at_booking);
    }

    public function test_a_public_request_on_a_nightly_rental_is_a_stay(): void
    {
        $daily = $this->bien(ContractType::Rent, RentPeriod::Daily, '20000');

        $this->postJson("/api/public/properties/{$daily->slug}/booking-request", [
            'start_date' => '2026-12-01',
            'end_date' => '2026-12-03',
            'guests' => 2,
        ])->assertCreated()->assertJsonPath('data.kind', 'stay');

        $this->assertSame(BookingKind::Stay, Booking::query()->sole()->kind);
        $this->assertNull(Booking::query()->sole()->list_price_at_booking);
    }
}

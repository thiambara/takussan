<?php

namespace Tests\Feature\Public;

use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
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

<?php

namespace Tests\Feature\Public;

use App\Models\Enums\BookingStatus;
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
        $property = Property::factory()->published()->create();
        Sanctum::actingAs(User::factory()->create());

        $this->postJson("/api/public/properties/{$property->slug}/booking-request", [
            'start_date' => now()->addDays(3)->toDateString(),
            'end_date' => now()->addDay()->toDateString(),
            'guests' => 1,
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

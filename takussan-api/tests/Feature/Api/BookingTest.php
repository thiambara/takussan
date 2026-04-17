<?php

namespace Tests\Feature\Api;

use App\Models\Booking;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BookingTest extends TestCase
{
    use RefreshDatabase;

    public function test_customer_can_create_booking(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create();

        Sanctum::actingAs($user);

        $this->postJson('/api/bookings', [
            'property_id' => $property->id,
            'total_amount' => 500000,
            'deposit_amount' => 100000,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addMonth()->toDateString(),
        ])->assertCreated()
            ->assertJsonPath('data.status', 'pending');

        $this->assertDatabaseCount('bookings', 1);
    }

    public function test_owner_can_confirm_booking(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $booking = Booking::factory()->create(['property_id' => $property->id]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/bookings/{$booking->id}/confirm")
            ->assertOk()
            ->assertJsonPath('data.status', 'confirmed');
    }

    public function test_owner_can_cancel_booking(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $booking = Booking::factory()->create(['property_id' => $property->id]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/bookings/{$booking->id}/cancel", ['reason' => 'unavailable'])
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled')
            ->assertJsonPath('data.cancellation_reason', 'unavailable');
    }
}

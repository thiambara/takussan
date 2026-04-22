<?php

namespace Tests\Feature\Api;

use App\Jobs\ExpireBookings;
use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BookingOverlapAndExpirationTest extends TestCase
{
    use RefreshDatabase;

    public function test_confirming_booking_that_overlaps_confirmed_booking_is_rejected(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        Booking::factory()->create([
            'property_id' => $property->id,
            'status' => BookingStatus::Confirmed,
            'start_date' => now()->addDay(),
            'end_date' => now()->addWeek(),
        ]);

        $pending = Booking::factory()->create([
            'property_id' => $property->id,
            'status' => BookingStatus::Pending,
            'start_date' => now()->addDays(3),
            'end_date' => now()->addDays(10),
        ]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/bookings/{$pending->id}/confirm")
            ->assertStatus(422);

        $this->assertSame(
            BookingStatus::Pending->value,
            $pending->fresh()->status?->value,
        );
    }

    public function test_confirming_booking_outside_existing_dates_succeeds(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        Booking::factory()->create([
            'property_id' => $property->id,
            'status' => BookingStatus::Confirmed,
            'start_date' => now()->addDay(),
            'end_date' => now()->addDays(5),
        ]);

        $pending = Booking::factory()->create([
            'property_id' => $property->id,
            'status' => BookingStatus::Pending,
            'start_date' => now()->addDays(10),
            'end_date' => now()->addDays(15),
        ]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/bookings/{$pending->id}/confirm")
            ->assertOk()
            ->assertJsonPath('data.status', 'confirmed');
    }

    public function test_overlap_check_ignores_other_properties(): void
    {
        $owner = User::factory()->create();
        $propA = Property::factory()->create(['user_id' => $owner->id]);
        $propB = Property::factory()->create(['user_id' => $owner->id]);

        Booking::factory()->create([
            'property_id' => $propA->id,
            'status' => BookingStatus::Confirmed,
            'start_date' => now()->addDay(),
            'end_date' => now()->addWeek(),
        ]);

        $pending = Booking::factory()->create([
            'property_id' => $propB->id,
            'status' => BookingStatus::Pending,
            'start_date' => now()->addDays(3),
            'end_date' => now()->addDays(4),
        ]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/bookings/{$pending->id}/confirm")
            ->assertOk();
    }

    public function test_expire_bookings_job_transitions_past_pending_to_expired(): void
    {
        $past = Booking::factory()->create([
            'status' => BookingStatus::Pending,
            'expires_at' => now()->subDay(),
        ]);

        $future = Booking::factory()->create([
            'status' => BookingStatus::Pending,
            'expires_at' => now()->addDay(),
        ]);

        (new ExpireBookings)->handle();

        $this->assertSame(BookingStatus::Expired->value, $past->fresh()->status?->value);
        $this->assertSame(BookingStatus::Pending->value, $future->fresh()->status?->value);
    }

    public function test_expire_bookings_job_leaves_confirmed_untouched(): void
    {
        $confirmed = Booking::factory()->create([
            'status' => BookingStatus::Confirmed,
            'expires_at' => now()->subDay(),
        ]);

        (new ExpireBookings)->handle();

        $this->assertSame(BookingStatus::Confirmed->value, $confirmed->fresh()->status?->value);
    }
}

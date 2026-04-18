<?php

namespace Tests\Feature\Api;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BookingTest extends TestCase
{
    use RefreshDatabase;

    public function test_customer_can_create_booking_for_self(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        $property = Property::factory()->create();

        Sanctum::actingAs($user);

        $this->postJson('/api/bookings', [
            'property_id' => $property->id,
            'customer_id' => $customer->id,
            'total_amount' => 500000,
            'deposit_amount' => 100000,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addMonth()->toDateString(),
        ])->assertCreated()
            ->assertJsonPath('data.status', 'pending');

        $this->assertDatabaseCount('bookings', 1);
    }

    public function test_random_user_cannot_create_booking_for_someone_else(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create();
        $property = Property::factory()->create();

        Sanctum::actingAs($user);

        $this->postJson('/api/bookings', [
            'property_id' => $property->id,
            'customer_id' => $customer->id,
            'total_amount' => 500000,
        ])->assertForbidden();
    }

    public function test_owner_cannot_book_own_property(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($owner);

        $this->postJson('/api/bookings', [
            'property_id' => $property->id,
            'total_amount' => 500000,
        ])->assertForbidden();
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

    public function test_random_user_cannot_confirm_booking(): void
    {
        $booking = Booking::factory()->create();
        Sanctum::actingAs(User::factory()->create());

        $this->postJson("/api/bookings/{$booking->id}/confirm")->assertForbidden();
    }

    public function test_cannot_confirm_already_cancelled_booking(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $booking = Booking::factory()->create([
            'property_id' => $property->id,
            'status' => BookingStatus::Cancelled->value,
        ]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/bookings/{$booking->id}/confirm")
            ->assertStatus(422);
    }

    public function test_owner_can_reject_booking(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $booking = Booking::factory()->create(['property_id' => $property->id]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/bookings/{$booking->id}/reject", ['reason' => 'not available dates'])
            ->assertOk()
            ->assertJsonPath('data.status', 'rejected');
    }

    public function test_cannot_reject_confirmed_booking(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $booking = Booking::factory()->create([
            'property_id' => $property->id,
            'status' => BookingStatus::Confirmed->value,
        ]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/bookings/{$booking->id}/reject", ['reason' => 'oops'])
            ->assertStatus(422);
    }

    public function test_cannot_cancel_already_terminal_booking(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $booking = Booking::factory()->create([
            'property_id' => $property->id,
            'status' => BookingStatus::Rejected->value,
        ]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/bookings/{$booking->id}/cancel", ['reason' => 'already gone'])
            ->assertStatus(422);
    }

    public function test_customer_can_cancel_their_own_booking(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        $booking = Booking::factory()->create([
            'customer_id' => $customer->id,
            'status' => BookingStatus::Pending->value,
        ]);

        Sanctum::actingAs($user);

        $this->postJson("/api/bookings/{$booking->id}/cancel", ['reason' => 'change of plans'])
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled');
    }

    public function test_cannot_create_booking_on_unbookable_property(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        $property = Property::factory()->create([
            'status' => PropertyStatus::Sold->value,
        ]);

        Sanctum::actingAs($user);

        $this->postJson('/api/bookings', [
            'property_id' => $property->id,
            'customer_id' => $customer->id,
            'total_amount' => 500000,
            'deposit_amount' => 100000,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addMonth()->toDateString(),
        ])->assertStatus(422);
    }
}

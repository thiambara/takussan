<?php

namespace Tests\Feature\Api;

use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BookingPaymentTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_record_deposit_payment(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $customer = Customer::factory()->create();
        $booking = Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => $customer->id,
        ]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/bookings/{$booking->id}/payments", [
            'amount' => 100000,
            'payment_type' => BookingPaymentType::Deposit->value,
        ])->assertCreated()
            ->assertJsonPath('data.status', 'paid')
            ->assertJsonPath('data.payment_type', 'deposit')
            ->assertJsonPath('data.amount', 100000);

        $this->assertDatabaseCount('booking_payments', 1);
        $this->assertDatabaseHas('booking_payments', [
            'booking_id' => $booking->id,
            'collector_id' => $owner->id,
            'payer_id' => $customer->id,
        ]);
    }

    public function test_random_user_cannot_record_payment(): void
    {
        $booking = Booking::factory()->create();
        Sanctum::actingAs(User::factory()->create());

        $this->postJson("/api/bookings/{$booking->id}/payments", [
            'amount' => 50000,
            'payment_type' => BookingPaymentType::Deposit->value,
        ])->assertForbidden();
    }

    public function test_invalid_payment_type_returns_422(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $booking = Booking::factory()->create(['property_id' => $property->id]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/bookings/{$booking->id}/payments", [
            'amount' => 50000,
            'payment_type' => 'not-a-type',
        ])->assertStatus(422);
    }

    public function test_owner_can_list_booking_payments(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $booking = Booking::factory()->create(['property_id' => $property->id]);
        BookingPayment::factory()->count(3)->create(['booking_id' => $booking->id]);

        Sanctum::actingAs($owner);

        $this->getJson("/api/bookings/{$booking->id}/payments")
            ->assertOk()
            ->assertJsonPath('meta.total', 3);
    }

    public function test_customer_can_view_own_booking_payments(): void
    {
        $customerUser = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $customerUser->id]);
        $booking = Booking::factory()->create(['customer_id' => $customer->id]);
        BookingPayment::factory()->count(2)->create(['booking_id' => $booking->id]);

        Sanctum::actingAs($customerUser);

        $this->getJson("/api/bookings/{$booking->id}/payments")
            ->assertOk()
            ->assertJsonPath('meta.total', 2);
    }

    public function test_owner_can_refund_paid_payment(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $booking = Booking::factory()->create(['property_id' => $property->id]);
        $payment = BookingPayment::factory()->paid()->create([
            'booking_id' => $booking->id,
            'amount' => 100000,
        ]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/booking-payments/{$payment->id}/refund", [
            'refund_amount' => 50000,
            'refund_reason' => 'partial cancellation',
        ])->assertOk()
            ->assertJsonPath('data.status', 'refunded')
            ->assertJsonPath('data.refund_amount', 50000);
    }

    public function test_cannot_refund_more_than_paid(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $booking = Booking::factory()->create(['property_id' => $property->id]);
        $payment = BookingPayment::factory()->paid()->create([
            'booking_id' => $booking->id,
            'amount' => 100000,
        ]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/booking-payments/{$payment->id}/refund", [
            'refund_amount' => 200000,
        ])->assertStatus(422);
    }

    public function test_cannot_refund_non_paid_payment(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $booking = Booking::factory()->create(['property_id' => $property->id]);
        $payment = BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'status' => PaymentStatus::Pending,
        ]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/booking-payments/{$payment->id}/refund", [
            'refund_amount' => 10000,
        ])->assertStatus(422);
    }
}

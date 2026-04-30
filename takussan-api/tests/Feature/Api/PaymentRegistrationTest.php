<?php

namespace Tests\Feature\Api;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\LeasePaymentType;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * POST /api/payments — unified router creating BookingPayment or LeasePayment.
 */
class PaymentRegistrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_register_booking_payment(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $customer = Customer::factory()->create();
        $booking = Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => $customer->id,
        ]);

        Sanctum::actingAs($owner);

        $response = $this->postJson('/api/payments', [
            'payable_type' => 'booking',
            'payable_id' => $booking->id,
            'amount' => 75_000,
            'payment_type' => BookingPaymentType::Deposit->value,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.source', 'booking')
            ->assertJsonPath('data.booking_id', $booking->id)
            ->assertJsonPath('data.amount', 75_000)
            ->assertJsonPath('data.status', 'paid');

        $this->assertDatabaseCount('booking_payments', 1);
    }

    public function test_landlord_can_register_lease_payment(): void
    {
        $landlord = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $tenant = Customer::factory()->create();
        $lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $landlord->id,
            'tenant_id' => $tenant->id,
        ]);

        Sanctum::actingAs($landlord);

        $response = $this->postJson('/api/payments', [
            'payable_type' => 'lease',
            'payable_id' => $lease->id,
            'amount' => 250_000,
            'payment_type' => LeasePaymentType::Rent->value,
            'period_start' => now()->startOfMonth()->toDateString(),
            'period_end' => now()->endOfMonth()->toDateString(),
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.source', 'lease')
            ->assertJsonPath('data.lease_id', $lease->id)
            ->assertJsonPath('data.amount', 250_000)
            ->assertJsonPath('data.status', 'pending');

        $this->assertDatabaseCount('lease_payments', 1);
        // remaining_amount accessor should equal amount while still pending
        $this->assertEquals(250_000.0, (float) $response->json('data.remaining_amount'));
    }

    public function test_random_user_cannot_register_booking_payment(): void
    {
        $booking = Booking::factory()->create();
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/payments', [
            'payable_type' => 'booking',
            'payable_id' => $booking->id,
            'amount' => 50_000,
            'payment_type' => BookingPaymentType::Deposit->value,
        ])->assertForbidden();
    }

    public function test_invalid_payable_type_returns_422(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/payments', [
            'payable_type' => 'invoice',
            'payable_id' => 1,
            'amount' => 10_000,
            'payment_type' => 'something',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['payable_type']);
    }

    public function test_missing_payable_id_returns_422(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/payments', [
            'payable_type' => 'booking',
            'amount' => 10_000,
            'payment_type' => BookingPaymentType::Deposit->value,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['payable_id']);
    }

    public function test_unknown_booking_returns_404(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/payments', [
            'payable_type' => 'booking',
            'payable_id' => 999_999,
            'amount' => 10_000,
            'payment_type' => BookingPaymentType::Deposit->value,
        ])->assertStatus(404);
    }

    public function test_lease_payment_requires_period_dates(): void
    {
        $landlord = User::factory()->create();
        $lease = Lease::factory()->create(['landlord_id' => $landlord->id]);

        Sanctum::actingAs($landlord);

        $this->postJson('/api/payments', [
            'payable_type' => 'lease',
            'payable_id' => $lease->id,
            'amount' => 100_000,
            'payment_type' => LeasePaymentType::Rent->value,
            // missing period_start / period_end
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['period_start', 'period_end']);
    }

    public function test_invalid_booking_payment_type_returns_422(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $booking = Booking::factory()->create(['property_id' => $property->id]);

        Sanctum::actingAs($owner);

        $this->postJson('/api/payments', [
            'payable_type' => 'booking',
            'payable_id' => $booking->id,
            'amount' => 10_000,
            'payment_type' => 'rent', // valid for lease, invalid for booking
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['payment_type']);
    }
}

<?php

namespace Tests\Feature\Api;

use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * GET /api/payments/history — consolidated history of BookingPayment + LeasePayment
 * with entity/status/date filters, pagination and aggregated totals.
 */
class PaymentHistoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_history_returns_merged_booking_and_lease_payments(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $customer = Customer::factory()->create();

        $booking = Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => $customer->id,
        ]);
        BookingPayment::factory()->count(2)->paid()->create([
            'booking_id' => $booking->id,
            'amount' => 50_000,
        ]);

        $lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $owner->id,
            'tenant_id' => $customer->id,
        ]);
        LeasePayment::factory()->count(3)->create([
            'lease_id' => $lease->id,
            'payer_id' => $customer->id,
            'amount' => 120_000,
        ]);

        Sanctum::actingAs($owner);

        $response = $this->getJson('/api/payments/history');

        $response->assertOk()
            ->assertJsonPath('meta.total', 5)
            ->assertJsonStructure([
                'data' => [['source', 'id', 'amount', 'status', 'paid_amount', 'remaining_amount']],
                'meta' => ['total', 'current_page', 'per_page', 'totals'],
            ]);

        // Totals sum across all filtered rows: 2 * 50_000 + 3 * 120_000
        $this->assertEqualsWithDelta(
            2 * 50_000 + 3 * 120_000,
            (float) $response->json('meta.totals.amount'),
            0.001,
        );
    }

    public function test_filter_by_entity_property(): void
    {
        $owner = User::factory()->create();
        $propertyA = Property::factory()->create(['user_id' => $owner->id]);
        $propertyB = Property::factory()->create(['user_id' => $owner->id]);

        $bookingA = Booking::factory()->create(['property_id' => $propertyA->id]);
        $bookingB = Booking::factory()->create(['property_id' => $propertyB->id]);
        BookingPayment::factory()->count(2)->paid()->create(['booking_id' => $bookingA->id]);
        BookingPayment::factory()->count(1)->paid()->create(['booking_id' => $bookingB->id]);

        Sanctum::actingAs($owner);

        $this->getJson('/api/payments/history?filter[entity_type]=property&filter[entity_id]='.$propertyA->id)
            ->assertOk()
            ->assertJsonPath('meta.total', 2);
    }

    public function test_filter_by_entity_lease(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $customer = Customer::factory()->create();
        $lease1 = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $owner->id,
            'tenant_id' => $customer->id,
        ]);
        $lease2 = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $owner->id,
            'tenant_id' => $customer->id,
        ]);
        LeasePayment::factory()->count(4)->create([
            'lease_id' => $lease1->id,
            'payer_id' => $customer->id,
        ]);
        LeasePayment::factory()->count(2)->create([
            'lease_id' => $lease2->id,
            'payer_id' => $customer->id,
        ]);

        Sanctum::actingAs($owner);

        $this->getJson('/api/payments/history?filter[entity_type]=lease&filter[entity_id]='.$lease1->id)
            ->assertOk()
            ->assertJsonPath('meta.total', 4);
    }

    public function test_filter_by_entity_booking_excludes_lease_payments(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $customer = Customer::factory()->create();

        $booking = Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => $customer->id,
        ]);
        BookingPayment::factory()->count(3)->paid()->create(['booking_id' => $booking->id]);

        $lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $owner->id,
            'tenant_id' => $customer->id,
        ]);
        LeasePayment::factory()->count(2)->create([
            'lease_id' => $lease->id,
            'payer_id' => $customer->id,
        ]);

        Sanctum::actingAs($owner);

        $this->getJson('/api/payments/history?filter[entity_type]=booking&filter[entity_id]='.$booking->id)
            ->assertOk()
            ->assertJsonPath('meta.total', 3);
    }

    public function test_filter_by_entity_customer(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $customerA = Customer::factory()->create();
        $customerB = Customer::factory()->create();

        $bookingA = Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => $customerA->id,
        ]);
        $bookingB = Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => $customerB->id,
        ]);
        BookingPayment::factory()->count(2)->paid()->create(['booking_id' => $bookingA->id]);
        BookingPayment::factory()->count(1)->paid()->create(['booking_id' => $bookingB->id]);

        $leaseA = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $owner->id,
            'tenant_id' => $customerA->id,
        ]);
        LeasePayment::factory()->count(3)->create([
            'lease_id' => $leaseA->id,
            'payer_id' => $customerA->id,
        ]);

        Sanctum::actingAs($owner);

        $this->getJson('/api/payments/history?filter[entity_type]=customer&filter[entity_id]='.$customerA->id)
            ->assertOk()
            ->assertJsonPath('meta.total', 2 + 3);
    }

    public function test_filter_by_status(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $customer = Customer::factory()->create();

        $booking = Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => $customer->id,
        ]);
        BookingPayment::factory()->count(2)->paid()->create(['booking_id' => $booking->id]);
        BookingPayment::factory()->count(3)->create([
            'booking_id' => $booking->id,
            'status' => PaymentStatus::Pending,
        ]);

        Sanctum::actingAs($owner);

        $this->getJson('/api/payments/history?filter[status]=paid')
            ->assertOk()
            ->assertJsonPath('meta.total', 2);
    }

    public function test_pagination_splits_results(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $booking = Booking::factory()->create(['property_id' => $property->id]);
        BookingPayment::factory()->count(25)->paid()->create(['booking_id' => $booking->id]);

        Sanctum::actingAs($owner);

        $this->getJson('/api/payments/history?per_page=10&page=1')
            ->assertOk()
            ->assertJsonPath('meta.total', 25)
            ->assertJsonPath('meta.per_page', 10)
            ->assertJsonCount(10, 'data');
    }

    public function test_user_cannot_see_other_users_payments(): void
    {
        $ownerA = User::factory()->create();
        $propertyA = Property::factory()->create(['user_id' => $ownerA->id]);
        $bookingA = Booking::factory()->create(['property_id' => $propertyA->id]);
        BookingPayment::factory()->count(3)->paid()->create(['booking_id' => $bookingA->id]);

        $outsider = User::factory()->create();
        Sanctum::actingAs($outsider);

        $this->getJson('/api/payments/history')
            ->assertOk()
            ->assertJsonPath('meta.total', 0);
    }

    public function test_totals_are_consistent_with_payments(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $booking = Booking::factory()->create(['property_id' => $property->id]);
        BookingPayment::factory()->count(3)->paid()->create([
            'booking_id' => $booking->id,
            'amount' => 100_000,
        ]);

        Sanctum::actingAs($owner);

        $response = $this->getJson('/api/payments/history');
        $response->assertOk();

        $totals = $response->json('meta.totals');
        $this->assertSame(3, (int) $totals['count']);
        $this->assertEqualsWithDelta(300_000.0, (float) $totals['amount'], 0.001);
        $this->assertEqualsWithDelta(300_000.0, (float) $totals['paid_amount'], 0.001);
        $this->assertEqualsWithDelta(0.0, (float) $totals['remaining_amount'], 0.001);
    }
}

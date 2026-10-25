<?php

namespace Tests\Feature\Validation;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\BookingStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;

/**
 * TCK-1112 (P91.08) — `reviews.title`, `lease_payments.transaction_id` et
 * `booking_payments.transaction_id` sont des `varchar(255)`. Le titre d'un avis d'agence ou de bien
 * et la référence d'un encaissement manuel y sont bornés : au-delà, 422 sur la clé, et non le 500
 * de PostgreSQL (22001). À la borne, l'écriture passe.
 */
class AvisEtEncaissementFieldLengthTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_titre_d_un_avis_d_agence(): void
    {
        $this->apiActingAsRole('super_admin');
        $agency = Agency::factory()->create();

        $this->postJson("/api/agencies/{$agency->id}/reviews", ['rating' => 4, 'title' => str_repeat('a', 256)])
            ->assertStatus(422)
            ->assertJsonValidationErrors('title');
        $this->assertSame(0, Review::query()->count());

        $this->postJson("/api/agencies/{$agency->id}/reviews", ['rating' => 4, 'title' => str_repeat('a', 255)])
            ->assertCreated();
    }

    public function test_titre_d_un_avis_de_bien(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => $customer->id,
            'status' => BookingStatus::Completed,
        ]);
        Sanctum::actingAs($user);

        $this->postJson("/api/properties/{$property->id}/reviews", ['rating' => 4, 'title' => str_repeat('a', 256)])
            ->assertStatus(422)
            ->assertJsonValidationErrors('title');
        $this->assertSame(0, Review::query()->count());

        $this->postJson("/api/properties/{$property->id}/reviews", ['rating' => 4, 'title' => str_repeat('a', 255)])
            ->assertCreated();
    }

    public function test_reference_d_un_encaissement_d_echeance(): void
    {
        $landlord = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => null]);
        $lease = Lease::factory()->create(['property_id' => $property->id, 'landlord_id' => $landlord->id, 'agency_id' => null]);
        $payment = LeasePayment::factory()->create(['lease_id' => $lease->id]);
        Sanctum::actingAs($landlord);

        $this->postJson("/api/lease-payments/{$payment->id}/mark-paid", ['transaction_id' => str_repeat('T', 256)])
            ->assertStatus(422)
            ->assertJsonValidationErrors('transaction_id');
        $this->assertNull($payment->fresh()->transaction_id);

        $this->postJson("/api/lease-payments/{$payment->id}/mark-paid", ['transaction_id' => str_repeat('T', 255)])
            ->assertOk();
    }

    public function test_reference_d_un_paiement_de_reservation(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        // Le reste dû borne l'acompte (TCK-1916) : un total tiré sous 100 000 rendait 422.
        $booking = Booking::factory()->create(['property_id' => $property->id, 'customer_id' => Customer::factory()->create()->id, 'total_amount' => 1_000_000]);
        Sanctum::actingAs($owner);

        $corps = fn (string $reference) => [
            'amount' => 100000,
            'payment_type' => BookingPaymentType::Deposit->value,
            'transaction_id' => $reference,
        ];

        $this->postJson("/api/bookings/{$booking->id}/payments", $corps(str_repeat('T', 256)))
            ->assertStatus(422)
            ->assertJsonValidationErrors('transaction_id');
        $this->assertDatabaseCount('booking_payments', 0);

        $this->postJson("/api/bookings/{$booking->id}/payments", $corps(str_repeat('T', 255)))->assertCreated();
    }
}

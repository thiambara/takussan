<?php

namespace Tests\Feature\Api;

use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\PaymentStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-1311 (P147.09) — un paiement de réservation saisi à la main naît `paid`, `pending` ou
 * `partially_paid` : `refunded`, `failed` et `late` passaient, hors du geste `refund` (qui exige
 * une ligne `paid`).
 */
class BookingPaymentManualStatusTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->buildStakeholders();
    }

    public function test_le_personnel_ne_cree_pas_une_ligne_remboursee_echouee_ou_en_retard(): void
    {
        $booking = $this->bookingOfClient(['status' => BookingStatus::Confirmed]);
        Sanctum::actingAs($this->agent);

        foreach ([PaymentStatus::Refunded, PaymentStatus::Failed, PaymentStatus::Late] as $status) {
            $this->postJson("/api/bookings/{$booking->id}/payments", [
                'amount' => 5_000,
                'payment_type' => BookingPaymentType::Advance->value,
                'status' => $status->value,
            ])->assertStatus(422)->assertJsonValidationErrors('status');
        }

        $this->assertSame(0, $booking->payments()->count());
    }

    public function test_paid_pending_et_partially_paid_restent_permis(): void
    {
        $booking = $this->bookingOfClient(['status' => BookingStatus::Confirmed]);
        Sanctum::actingAs($this->agent);

        foreach ([PaymentStatus::Paid, PaymentStatus::Pending, PaymentStatus::PartiallyPaid] as $status) {
            $this->postJson("/api/bookings/{$booking->id}/payments", [
                'amount' => 5_000,
                'payment_type' => BookingPaymentType::Advance->value,
                'status' => $status->value,
            ])->assertCreated()->assertJsonPath('data.status', $status->value);
        }
    }
}

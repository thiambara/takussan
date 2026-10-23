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
 *
 * TCK-1918 (P170.03, décision du porteur, revient sur TCK-1311) — `partially_paid` ne se pose plus à
 * la main : la ligne n'était comptée ni dans le dû du client ni au reversement, et le client se
 * voyait redemander l'acompte entier. Une part reçue est une ligne `paid` de son montant.
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

    public function test_le_personnel_ne_cree_pas_une_ligne_remboursee_echouee_en_retard_ou_partielle(): void
    {
        $booking = $this->bookingOfClient(['status' => BookingStatus::Confirmed]);
        Sanctum::actingAs($this->agent);

        foreach ([PaymentStatus::Refunded, PaymentStatus::Failed, PaymentStatus::Late, PaymentStatus::PartiallyPaid] as $status) {
            $this->postJson("/api/bookings/{$booking->id}/payments", [
                'amount' => 5_000,
                'payment_type' => BookingPaymentType::Advance->value,
                'status' => $status->value,
            ])->assertStatus(422)->assertJsonValidationErrors('status');
        }

        $this->assertSame(0, $booking->payments()->count());
    }

    public function test_paid_et_pending_restent_permis(): void
    {
        $booking = $this->bookingOfClient(['status' => BookingStatus::Confirmed]);
        Sanctum::actingAs($this->agent);

        foreach ([PaymentStatus::Paid, PaymentStatus::Pending] as $status) {
            $this->postJson("/api/bookings/{$booking->id}/payments", [
                'amount' => 5_000,
                'payment_type' => BookingPaymentType::Advance->value,
                'status' => $status->value,
            ])->assertCreated()->assertJsonPath('data.status', $status->value);
        }
    }

    public function test_une_part_recue_saisie_paid_reduit_le_du_du_client(): void
    {
        $booking = $this->bookingOfClient([
            'status' => BookingStatus::Confirmed,
            'total_amount' => 100_000,
            'deposit_amount' => 30_000,
        ]);
        Sanctum::actingAs($this->agent);
        $this->postJson("/api/bookings/{$booking->id}/payments", [
            'amount' => 10_000,
            'payment_type' => BookingPaymentType::Deposit->value,
            'status' => PaymentStatus::Paid->value,
        ])->assertCreated();

        Sanctum::actingAs($this->client);
        $this->postJson("/api/bookings/{$booking->id}/payments", [])
            ->assertCreated()
            ->assertJsonPath('data.amount', 90000);
    }
}

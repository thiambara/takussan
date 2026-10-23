<?php

namespace Tests\Feature\Api;

use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-1914 (P170.01, décision du porteur) — le client ne paie que sur une réservation `pending` ou
 * `confirmed`. L'API dérivait le reste dû sans lire le statut de la réservation : sur une réservation
 * annulée, refusée ou expirée, le client ouvrait une ligne `pending` que la passerelle jugeait payable.
 */
class BookingPaymentBookingStatusTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->buildStakeholders();
    }

    /** @return array<string, array{BookingStatus}> */
    public static function statutsNonPayables(): array
    {
        return [
            'cancelled' => [BookingStatus::Cancelled],
            'rejected' => [BookingStatus::Rejected],
            'expired' => [BookingStatus::Expired],
            'completed' => [BookingStatus::Completed],
        ];
    }

    /** @return array<string, array{BookingStatus}> */
    public static function statutsPayables(): array
    {
        return [
            'pending' => [BookingStatus::Pending],
            'confirmed' => [BookingStatus::Confirmed],
        ];
    }

    private function booking(BookingStatus $status): Booking
    {
        return $this->bookingOfClient([
            'status' => $status,
            'total_amount' => 100_000,
            'deposit_amount' => 30_000,
        ]);
    }

    #[DataProvider('statutsNonPayables')]
    public function test_le_client_ne_paie_pas_une_reservation_hors_pending_et_confirmed(BookingStatus $status): void
    {
        $booking = $this->booking($status);
        Sanctum::actingAs($this->client);

        $this->postJson("/api/bookings/{$booking->id}/payments", [])
            ->assertStatus(422)
            ->assertJsonPath('code', 'booking_payment.booking_not_payable');

        $this->assertSame(0, $booking->payments()->count());
    }

    #[DataProvider('statutsPayables')]
    public function test_le_client_paie_une_reservation_pending_ou_confirmed(BookingStatus $status): void
    {
        $booking = $this->booking($status);
        Sanctum::actingAs($this->client);

        $this->postJson("/api/bookings/{$booking->id}/payments", [])
            ->assertCreated()
            ->assertJsonPath('data.amount', 30000);
    }

    #[DataProvider('statutsNonPayables')]
    public function test_la_passerelle_refuse_la_ligne_d_une_reservation_hors_pending_et_confirmed(BookingStatus $status): void
    {
        $payment = $this->pendingLine($this->booking($status));

        $this->assertFalse(app(PaymentGatewayService::class)->isPayable($payment->fresh()));
    }

    #[DataProvider('statutsPayables')]
    public function test_la_passerelle_accepte_la_ligne_d_une_reservation_pending_ou_confirmed(BookingStatus $status): void
    {
        $payment = $this->pendingLine($this->booking($status));

        $this->assertTrue(app(PaymentGatewayService::class)->isPayable($payment->fresh()));
    }

    private function pendingLine(Booking $booking): BookingPayment
    {
        return BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => 30_000,
            'currency' => Currency::XOF,
            'payment_type' => BookingPaymentType::Deposit,
            'status' => PaymentStatus::Pending,
            'paid_at' => null,
        ]);
    }
}

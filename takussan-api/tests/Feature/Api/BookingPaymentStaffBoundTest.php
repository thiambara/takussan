<?php

namespace Tests\Feature\Api;

use App\Models\Booking;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\PaymentStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-1916 (P170.02, décision du porteur) — un paiement de réservation saisi par le personnel était
 * écrit tel quel : `999 999 999` en `advance` sur une réservation de 100 000 → 201, ligne `paid`, et
 * elle entrait au brut du prochain reversement du bailleur. Borne : `total_amount` moins les lignes
 * `paid` (`deposit` et `advance`, `fee` hors du total reversable, ADR-0039 § 3), sur les statuts de
 * réservation de P170.01, `completed` compris pour le personnel.
 */
class BookingPaymentStaffBoundTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->buildStakeholders();
    }

    private function booking(BookingStatus $status = BookingStatus::Confirmed): Booking
    {
        return $this->bookingOfClient([
            'status' => $status,
            'total_amount' => 100_000,
            'deposit_amount' => 30_000,
        ]);
    }

    /** @param  array<string, mixed>  $extra */
    private function record(Booking $booking, int|float $amount, BookingPaymentType $type = BookingPaymentType::Advance, array $extra = []): TestResponse
    {
        Sanctum::actingAs($this->agent);

        return $this->postJson("/api/bookings/{$booking->id}/payments", array_merge([
            'amount' => $amount,
            'payment_type' => $type->value,
            'payment_method' => 'cash',
        ], $extra));
    }

    public function test_un_montant_au_dela_du_total_est_refuse_sans_ligne_ecrite(): void
    {
        $booking = $this->booking();

        $this->record($booking, 999_999_999)
            ->assertStatus(422)
            ->assertJsonPath('code', 'booking_payment.exceeds_remaining');

        $this->assertSame(0, $booking->payments()->count());
    }

    public function test_la_borne_est_le_total_moins_les_lignes_payees(): void
    {
        $booking = $this->booking();
        $this->paidDeposit($booking, 30_000);

        $this->record($booking, 70_001)
            ->assertStatus(422)
            ->assertJsonPath('code', 'booking_payment.exceeds_remaining');

        $this->record($booking, 70_000)->assertCreated()->assertJsonPath('data.amount', 70000);

        $this->record($booking, 1, BookingPaymentType::Deposit)
            ->assertStatus(422)
            ->assertJsonPath('code', 'booking_payment.exceeds_remaining');
    }

    public function test_une_ligne_non_payee_ne_reduit_pas_la_borne(): void
    {
        $booking = $this->booking();
        $this->paidDeposit($booking, 50_000, PaymentStatus::Pending);

        $this->record($booking, 100_000)->assertCreated();
    }

    public function test_les_frais_ne_sont_ni_bornes_ni_deduits(): void
    {
        $booking = $this->booking();

        $this->record($booking, 150_000, BookingPaymentType::Fee)->assertCreated();
        $this->record($booking, 100_000)->assertCreated();
    }

    /** @return array<string, array{BookingStatus}> */
    public static function statutsRefuses(): array
    {
        return [
            'cancelled' => [BookingStatus::Cancelled],
            'rejected' => [BookingStatus::Rejected],
            'expired' => [BookingStatus::Expired],
        ];
    }

    #[DataProvider('statutsRefuses')]
    public function test_le_personnel_n_enregistre_pas_sur_une_reservation_close(BookingStatus $status): void
    {
        $booking = $this->booking($status);

        $this->record($booking, 10_000)
            ->assertStatus(422)
            ->assertJsonPath('code', 'booking_payment.booking_not_payable');

        $this->assertSame(0, $booking->payments()->count());
    }

    /** @return array<string, array{BookingStatus}> */
    public static function statutsAcceptes(): array
    {
        return [
            'pending' => [BookingStatus::Pending],
            'confirmed' => [BookingStatus::Confirmed],
            'completed' => [BookingStatus::Completed],
        ];
    }

    #[DataProvider('statutsAcceptes')]
    public function test_le_personnel_enregistre_sur_pending_confirmed_et_completed(BookingStatus $status): void
    {
        $this->record($this->booking($status), 10_000)->assertCreated();
    }
}

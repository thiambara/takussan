<?php

namespace Tests\Feature\Api;

use App\Models\Booking;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\PaymentStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-1309 (P133.05) — le montant d'un paiement de réservation posté par le client était calculé
 * par le navigateur et écrit tel quel : `amount = 1` ou `999 999 999` en `deposit` → 201, et la
 * passerelle encaissait ce montant. L'API le dérive : l'acompte tant que rien n'est payé, puis le
 * reste dû. Le personnel garde sa saisie.
 */
class BookingPaymentAmountDerivedTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    private Booking $booking;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->buildStakeholders();
        $this->booking = $this->bookingOfClient([
            'status' => BookingStatus::Confirmed,
            'total_amount' => 100_000,
            'deposit_amount' => 30_000,
        ]);
    }

    public function test_le_client_qui_ne_donne_aucun_montant_paie_l_acompte(): void
    {
        Sanctum::actingAs($this->client);

        $this->postJson("/api/bookings/{$this->booking->id}/payments", ['status' => 'pending'])
            ->assertCreated()
            ->assertJsonPath('data.amount', 30000)
            ->assertJsonPath('data.payment_type', BookingPaymentType::Deposit->value)
            ->assertJsonPath('data.status', PaymentStatus::Pending->value);
    }

    public function test_le_montant_envoye_par_le_client_est_ignore(): void
    {
        Sanctum::actingAs($this->client);

        foreach ([1, 999_999_999] as $amount) {
            $this->postJson("/api/bookings/{$this->booking->id}/payments", [
                'amount' => $amount,
                'payment_type' => BookingPaymentType::Deposit->value,
            ])->assertCreated()->assertJsonPath('data.amount', 30000);
        }
    }

    public function test_l_acompte_paye_le_client_paie_le_reste_du(): void
    {
        $this->paidDeposit($this->booking, 30_000);
        Sanctum::actingAs($this->client);

        $this->postJson("/api/bookings/{$this->booking->id}/payments", [
            'amount' => 5,
            'payment_type' => BookingPaymentType::Deposit->value,
        ])->assertCreated()
            ->assertJsonPath('data.amount', 70000)
            ->assertJsonPath('data.payment_type', BookingPaymentType::Advance->value);
    }

    public function test_sans_acompte_le_client_paie_le_total(): void
    {
        $this->booking->update(['deposit_amount' => 0]);
        Sanctum::actingAs($this->client);

        $this->postJson("/api/bookings/{$this->booking->id}/payments", [])
            ->assertCreated()
            ->assertJsonPath('data.amount', 100000)
            ->assertJsonPath('data.payment_type', BookingPaymentType::Advance->value);
    }

    public function test_une_reservation_soldee_ne_prend_plus_de_paiement_du_client(): void
    {
        $this->paidDeposit($this->booking, 100_000);
        Sanctum::actingAs($this->client);

        $this->postJson("/api/bookings/{$this->booking->id}/payments", [])
            ->assertStatus(422)
            ->assertJsonPath('code', 'booking_payment.nothing_due');
    }

    public function test_le_personnel_garde_sa_saisie_et_doit_la_donner(): void
    {
        Sanctum::actingAs($this->agent);

        $this->postJson("/api/bookings/{$this->booking->id}/payments", [
            'payment_type' => BookingPaymentType::Advance->value,
        ])->assertStatus(422)->assertJsonValidationErrors('amount');

        $this->postJson("/api/bookings/{$this->booking->id}/payments", [
            'amount' => 5_000,
            'payment_type' => BookingPaymentType::Advance->value,
        ])->assertCreated()->assertJsonPath('data.amount', 5000);
    }
}

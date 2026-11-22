<?php

namespace Tests\Feature\Api;

use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2879 — la liste des réservations sert `amount_paid`, ce que le client a déjà réglé : la carte
 * de « Mes réservations » en dérive l'acompte ou le solde dû sans lire les paiements. Compté comme
 * `BookingPaymentService::dueFromCustomer` : seulement `paid`, ni caution ni « autre ».
 */
class BookingAmountPaidTest extends TestCase
{
    use RefreshDatabase;

    private User $client;

    private Booking $booking;

    protected function setUp(): void
    {
        parent::setUp();
        $this->client = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $this->client->id]);
        $this->booking = Booking::factory()->confirmed()->create(['customer_id' => $customer->id, 'total_amount' => 110_000, 'deposit_amount' => 33_000]);
    }

    private function paiement(BookingPaymentType $type, PaymentStatus $status, int $montant): void
    {
        BookingPayment::factory()->create([
            'booking_id' => $this->booking->id, 'payment_type' => $type, 'status' => $status, 'amount' => $montant,
            'paid_at' => $status === PaymentStatus::Paid ? now() : null,
        ]);
    }

    public function test_the_list_serves_what_the_customer_paid_without_deposit_or_other(): void
    {
        $this->paiement(BookingPaymentType::Deposit, PaymentStatus::Paid, 33_000);
        $this->paiement(BookingPaymentType::Advance, PaymentStatus::Paid, 20_000);
        $this->paiement(BookingPaymentType::Advance, PaymentStatus::Pending, 57_000);
        $this->paiement(BookingPaymentType::SecurityDeposit, PaymentStatus::Paid, 50_000);
        $this->paiement(BookingPaymentType::Other, PaymentStatus::Paid, 5_000);
        Sanctum::actingAs($this->client);

        // Sous le sparse fieldset de « Mes réservations » : la somme s'ajoute aux colonnes choisies.
        $ligne = $this->getJson('/api/bookings?fields[bookings]=id,status,total_amount,deposit_amount,kind,customer_id,agency_id')
            ->assertOk()->json('data.0');

        $this->assertSame($this->booking->id, $ligne['id']);
        $this->assertEquals(53_000, $ligne['amount_paid']);
    }

    public function test_nothing_paid_reads_zero_and_the_detail_does_not_serve_it(): void
    {
        $this->paiement(BookingPaymentType::Deposit, PaymentStatus::Pending, 33_000);
        Sanctum::actingAs($this->client);

        $this->assertEquals(0, $this->getJson('/api/bookings')->assertOk()->json('data.0.amount_paid'));
        // La fiche lit les paiements eux-mêmes (`booking_payments`) : la clé n'y sort pas.
        $this->assertArrayNotHasKey('amount_paid', $this->getJson("/api/bookings/{$this->booking->id}")->assertOk()->json('data'));
    }
}

<?php

namespace Tests\Feature\Api;

use App\Models\Enums\PaymentStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\Support\EncaissementsPlateforme;
use Tests\TestCase;

/**
 * TCK-1160 (P76.04) — un acompte soldé en ligne par la plateforme ne se déclare pas remboursé par
 * l'agence : la plateforme détient l'argent, et le remboursement passe par son fournisseur. Avant :
 * le geste rendait 200, l'acompte sortait de la clôture de la plateforme sans qu'elle ait rien rendu.
 */
class BookingPaymentRefundSettledByPlatformTest extends TestCase
{
    use BuildsBookingStakeholders, EncaissementsPlateforme, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->buildStakeholders();
        Sanctum::actingAs($this->agencyAdmin($this->agency));
    }

    public function test_a_deposit_settled_by_the_platform_is_not_refunded_by_hand(): void
    {
        $payment = $this->soldeParLaPlateforme($this->paidDeposit($this->bookingOfClient()));

        $this->postJson("/api/booking-payments/{$payment->id}/refund", ['refund_amount' => 10_000])
            ->assertStatus(422)
            ->assertJsonPath('code', 'booking_payment.refund_settled_by_platform');

        $fresh = $payment->fresh();
        $this->assertSame(PaymentStatus::Paid, $fresh->status);
        $this->assertNull($fresh->refund_amount);
    }

    public function test_a_deposit_settled_by_the_agency_own_integration_is_still_refunded_by_hand(): void
    {
        $payment = $this->soldeParLAgence($this->paidDeposit($this->bookingOfClient()), $this->agency);

        $this->postJson("/api/booking-payments/{$payment->id}/refund", ['refund_amount' => 10_000])->assertOk();

        $this->assertSame(PaymentStatus::Refunded, $payment->fresh()->status);
    }

    public function test_a_deposit_paid_offline_is_still_refunded_by_hand(): void
    {
        $payment = $this->paidDeposit($this->bookingOfClient());

        $this->postJson("/api/booking-payments/{$payment->id}/refund", ['refund_amount' => 10_000])->assertOk();

        $this->assertSame(PaymentStatus::Refunded, $payment->fresh()->status);
    }
}

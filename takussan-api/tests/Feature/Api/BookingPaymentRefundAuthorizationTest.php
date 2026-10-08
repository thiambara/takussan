<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\BookingPayment;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\Capability;
use App\Models\Enums\PaymentStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-596 (AC4) — qui rembourse un acompte, et qui enregistre un paiement `paid`.
 *
 * `refund` déléguait à `canManageBooking`, qui inclut le CLIENT (TCK-172, pour `store`) : le
 * client faisait passer son propre acompte à `refunded` sans qu'aucun argent ne bouge. `store`
 * comptait `isOwnerAt(agence)` comme du personnel : un autre bailleur de l'agence enregistrait un
 * acompte `paid` sur la réservation d'un autre bailleur.
 */
class BookingPaymentRefundAuthorizationTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    private BookingPayment $payment;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->buildStakeholders();
    }

    private function refundAs(User $user, int $amount = 10_000): TestResponse
    {
        $booking = $this->bookingOfClient();
        $this->payment = $this->paidDeposit($booking);
        Sanctum::actingAs($user);

        return $this->postJson("/api/booking-payments/{$this->payment->id}/refund", ['refund_amount' => $amount]);
    }

    private function assertStillPaid(): void
    {
        $this->assertSame(PaymentStatus::Paid, $this->payment->fresh()->status);
    }

    public function test_the_client_cannot_refund_his_own_deposit(): void
    {
        $this->refundAs($this->client)->assertForbidden();
        $this->assertStillPaid();
    }

    public function test_another_landlord_of_the_same_agency_cannot_refund(): void
    {
        $this->refundAs(User::factory()->withOwnerProfile($this->agency)->create())->assertForbidden();
        $this->assertStillPaid();
    }

    public function test_an_agent_without_bookings_refund_cannot_refund(): void
    {
        $this->refundAs($this->agentWithout($this->agency, Capability::BookingsRefund))->assertForbidden();
        $this->assertStillPaid();
    }

    public function test_an_agent_granted_bookings_refund_can_refund(): void
    {
        $this->refundAs($this->agentWith($this->agency, Capability::BookingsRefund))->assertOk();
        $this->assertSame(PaymentStatus::Refunded, $this->payment->fresh()->status);
    }

    public function test_an_agency_admin_can_refund(): void
    {
        $this->refundAs($this->agencyAdmin($this->agency))->assertOk();
        $this->assertSame(PaymentStatus::Refunded, $this->payment->fresh()->status);
    }

    /** La capacité est LUE : le même admin, sans elle, est refusé. */
    public function test_an_agency_admin_without_bookings_refund_cannot_refund(): void
    {
        $this->refundAs($this->adminWithout($this->agency, Capability::BookingsRefund))->assertForbidden();
        $this->assertStillPaid();
    }

    public function test_the_direct_landlord_can_refund(): void
    {
        $this->refundAs($this->landlord)->assertOk();
        $this->assertSame(PaymentStatus::Refunded, $this->payment->fresh()->status);
    }

    public function test_a_super_admin_can_refund(): void
    {
        $superAdmin = User::factory()->create();
        $this->materializeRoleProfile($superAdmin, 'super_admin');

        $this->refundAs($superAdmin)->assertOk();
    }

    /** Second chemin : le bailleur suspendu dans l'agence reste partie, il perd les écritures (ADR-0031 §2). */
    public function test_a_blocked_direct_landlord_cannot_refund(): void
    {
        OwnerProfile::query()->where('user_id', $this->landlord->id)->update(['status' => 'blocked']);

        $this->refundAs($this->landlord)->assertForbidden();
        $this->assertStillPaid();
    }

    /**
     * VERIF-596 (hors diff, fermé ici) — le bailleur suspendu perd aussi confirmer, refuser et
     * annuler : `BookingPolicy::validate` et `cancel` ne lisaient que `property.user_id`.
     */
    public function test_a_blocked_direct_landlord_cannot_confirm_reject_or_cancel(): void
    {
        OwnerProfile::query()->where('user_id', $this->landlord->id)->update(['status' => 'blocked']);
        Sanctum::actingAs($this->landlord);

        foreach (['confirm', 'reject', 'cancel'] as $gesture) {
            $booking = $this->bookingOfClient();
            $this->postJson("/api/bookings/{$booking->id}/{$gesture}")->assertForbidden();
            $this->assertSame(BookingStatus::Pending, $booking->fresh()->status, $gesture);
        }
    }

    /** Le même bailleur, non suspendu, garde les trois gestes. */
    public function test_an_active_direct_landlord_confirms_rejects_and_cancels(): void
    {
        Sanctum::actingAs($this->landlord);

        foreach (['confirm', 'reject', 'cancel'] as $gesture) {
            $booking = $this->bookingOfClient();
            $this->postJson("/api/bookings/{$booking->id}/{$gesture}")->assertOk();
        }
    }

    /** Second chemin : un admin d'une AUTRE agence, titulaire de la capacité chez lui. */
    public function test_an_admin_of_another_agency_cannot_refund(): void
    {
        $this->refundAs($this->agencyAdmin(Agency::factory()->create()))->assertForbidden();
        $this->assertStillPaid();
    }

    /** Second chemin : un agent suspendu garde sa ligne de collaboration, plus son geste. */
    public function test_a_suspended_agent_granted_the_capability_cannot_refund(): void
    {
        $agent = $this->agentWith($this->agency, Capability::BookingsRefund);
        AgentProfile::query()->where('user_id', $agent->id)->update(['status' => 'suspended']);

        $this->refundAs($agent)->assertForbidden();
        $this->assertStillPaid();
    }

    /** XOF n'a pas de sous-unité : un remboursement de 1 000,50 est refusé. */
    public function test_a_fractional_xof_refund_is_refused(): void
    {
        $this->refundAs($this->landlord, 0)->assertStatus(422);

        $booking = $this->bookingOfClient();
        $payment = $this->paidDeposit($booking);
        $this->postJson("/api/booking-payments/{$payment->id}/refund", ['refund_amount' => 1000.5])
            ->assertStatus(422)
            ->assertJsonPath('code', 'booking_payment.refund_fractional');
        $this->assertSame(PaymentStatus::Paid, $payment->fresh()->status);

        $this->postJson("/api/booking-payments/{$payment->id}/refund", ['refund_amount' => '1000.00'])->assertOk();
    }

    public function test_another_landlord_of_the_same_agency_cannot_record_a_paid_payment(): void
    {
        $booking = $this->bookingOfClient();
        Sanctum::actingAs(User::factory()->withOwnerProfile($this->agency)->create());

        $this->postJson("/api/bookings/{$booking->id}/payments", [
            'amount' => 10_000,
            'payment_type' => BookingPaymentType::Deposit->value,
            'status' => PaymentStatus::Paid->value,
        ])->assertForbidden();

        $this->assertDatabaseCount('booking_payments', 0);
    }

    /** Second chemin : du personnel, mais d'une AUTRE agence. */
    public function test_an_agent_of_another_agency_cannot_record_a_paid_payment(): void
    {
        $booking = $this->bookingOfClient();
        Sanctum::actingAs($this->agencyAgent(Agency::factory()->create()));

        $this->postJson("/api/bookings/{$booking->id}/payments", [
            'amount' => 10_000,
            'payment_type' => BookingPaymentType::Deposit->value,
            'status' => PaymentStatus::Paid->value,
        ])->assertForbidden();

        $this->assertDatabaseCount('booking_payments', 0);
    }

    public function test_the_client_still_records_only_a_pending_payment(): void
    {
        $booking = $this->bookingOfClient();
        Sanctum::actingAs($this->client);

        $this->postJson("/api/bookings/{$booking->id}/payments", [
            'amount' => 10_000,
            'payment_type' => BookingPaymentType::Deposit->value,
            'status' => PaymentStatus::Paid->value,
        ])->assertCreated()->assertJsonPath('data.status', 'pending');
    }

    public function test_show_tells_who_can_refund(): void
    {
        $booking = $this->bookingOfClient();

        Sanctum::actingAs($this->client);
        $this->getJson("/api/bookings/{$booking->id}")->assertOk()->assertJsonPath('data.can_refund', false);

        Sanctum::actingAs($this->landlord);
        $this->getJson("/api/bookings/{$booking->id}")->assertOk()->assertJsonPath('data.can_refund', true);
    }
}

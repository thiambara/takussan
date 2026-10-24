<?php

namespace Tests\Feature\Booking;

use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Models\Integration;
use App\Models\Property;
use App\Models\User;
use App\Services\Booking\BookingExpirationService;
use App\Services\Model\BookingService;
use App\Services\Payout\PayoutCalculator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;

/**
 * TCK-2152 (P200.01, décision du porteur du 2026-10-24) — à la fermeture d'une réservation (annulée,
 * refusée, expirée), ses lignes de paiement `pending` passent `cancelled` sous son verrou : un
 * checkout ouvert avant et confirmé après prend le chemin du doublon (`gateway_duplicate_payment`,
 * avis `payment.duplicate` aux admins d'agence) et n'entre jamais au reversement du bailleur.
 *
 * Avant : la ligne restait `pending`, le succès du fournisseur l'écrivait `paid`, aucune tâche de
 * remboursement ne s'ouvrait, et `PayoutCalculator::bookingPayments` la rendait.
 */
class ClosedBookingPendingPaymentTest extends ApiTestCase
{
    use RefreshDatabase;

    private const SECRET = 'wave_secret_2152';

    private Agency $agency;

    private User $admin;

    private User $landlord;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();

        $this->agency = Agency::factory()->create();
        $this->admin = User::factory()->withTwoFactor()->create();
        $this->materializeRoleProfile($this->admin, 'agency_admin', $this->agency);
        $this->landlord = User::factory()->create();
    }

    public function test_a_cancelled_booking_turns_a_late_success_into_a_duplicate(): void
    {
        [$booking, $payment, $integration] = $this->arrange(BookingStatus::Confirmed);

        app(BookingService::class)->cancel($booking, $this->admin);

        $this->assertLateSuccessIsADuplicate($payment, $integration);
    }

    public function test_a_rejected_booking_turns_a_late_success_into_a_duplicate(): void
    {
        [$booking, $payment, $integration] = $this->arrange(BookingStatus::Pending);

        app(BookingService::class)->reject($booking, null, $this->admin);

        $this->assertLateSuccessIsADuplicate($payment, $integration);
    }

    public function test_an_expired_booking_turns_a_late_success_into_a_duplicate(): void
    {
        [$booking, $payment, $integration] = $this->arrange(BookingStatus::Pending);

        $this->assertTrue(app(BookingExpirationService::class)->expire($booking, BookingExpirationService::REASON_MANUAL));

        $this->assertLateSuccessIsADuplicate($payment, $integration);
    }

    /** Témoin : sans fermeture, le même succès solde la ligne et elle entre au reversement. */
    public function test_an_open_booking_still_settles_its_pending_line(): void
    {
        [, $payment, $integration] = $this->arrange(BookingStatus::Confirmed);

        $this->signedPost($this->uri($integration), $this->paidBody($payment->transaction_id))->assertOk();

        $this->assertSame(PaymentStatus::Paid, $payment->refresh()->status);
        $this->assertSame([$payment->id], $this->payable());
    }

    /** Une ligne déjà `paid` n'est pas touchée par la fermeture : elle reste au chemin de la tâche. */
    public function test_closing_leaves_a_paid_line_untouched(): void
    {
        [$booking, $payment] = $this->arrange(BookingStatus::Confirmed);
        $payment->update(['status' => PaymentStatus::Paid, 'paid_at' => now()]);

        app(BookingService::class)->cancel($booking, $this->admin);

        $this->assertSame(PaymentStatus::Paid, $payment->refresh()->status);
    }

    private function assertLateSuccessIsADuplicate(BookingPayment $payment, Integration $integration): void
    {
        $this->assertSame(PaymentStatus::Cancelled, $payment->refresh()->status, 'la fermeture n\'a pas annulé la ligne en attente');

        $this->signedPost($this->uri($integration), $this->paidBody($payment->transaction_id))->assertOk();

        $payment->refresh();
        $this->assertSame(PaymentStatus::Cancelled, $payment->status);
        $this->assertNull($payment->paid_at);
        $this->assertSame($payment->transaction_id, $payment->metadata['gateway_duplicate_payment'][0]['transaction_id'] ?? null);
        $this->assertSame(1, AppNotification::query()->where('user_id', $this->admin->id)
            ->where('code', 'payment.duplicate')->count());
        $this->assertSame([], $this->payable());
    }

    /** @return list<int> */
    private function payable(): array
    {
        return app(PayoutCalculator::class)->bookingPayments($this->agency->id, $this->landlord->id)
            ->pluck('booking_payments.id')->map(fn ($id) => (int) $id)->all();
    }

    /** @return array{0: Booking, 1: BookingPayment, 2: Integration} */
    private function arrange(BookingStatus $status): array
    {
        $property = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->landlord->id]);
        $booking = Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => Customer::factory()->create(['agency_id' => $this->agency->id])->id,
            'agency_id' => $this->agency->id,
            'currency' => Currency::XOF,
            'status' => $status,
            'confirmed_at' => $status === BookingStatus::Confirmed ? now() : null,
        ]);
        $txn = 'cs_2152_'.$booking->id;
        $payment = BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => 30000,
            'currency' => Currency::XOF,
            'status' => PaymentStatus::Pending,
            'paid_at' => null,
            'transaction_id' => $txn,
            'payment_type' => BookingPaymentType::Deposit,
            'metadata' => ['gateway' => ['provider' => 'wave', 'transaction_id' => $txn]],
        ]);
        $integration = Integration::factory()->create([
            'agency_id' => $this->agency->id,
            'provider' => 'wave',
            'is_active' => true,
            'credentials' => ['api_key' => 'k', 'webhook_secret' => self::SECRET],
        ]);

        return [$booking, $payment, $integration];
    }

    private function uri(Integration $integration): string
    {
        return '/api/webhooks/payments/'.$integration->provider.'/'.$integration->webhook_token;
    }

    private function paidBody(string $transactionId): string
    {
        return json_encode(['type' => 'checkout.session.completed', 'data' => ['id' => $transactionId]]);
    }

    private function signedPost(string $uri, string $body): TestResponse
    {
        $ts = time();

        return $this->call('POST', $uri, [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_WAVE_SIGNATURE' => "t={$ts},v1=".hash_hmac('sha256', $ts.'.'.$body, self::SECRET),
        ], $body);
    }
}

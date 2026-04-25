<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Models\Integration;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PaymentWebhookTest extends TestCase
{
    use RefreshDatabase;

    protected string $secret = 'wave_secret_for_tests';

    /**
     * Build a paid-pending payment + active wave integration with a known secret.
     */
    protected function arrangePending(string $txn = 'cs_wave_xyz', PaymentStatus $status = PaymentStatus::Pending): BookingPayment
    {
        $agency = Agency::factory()->create();
        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $customer = Customer::factory()->create();
        $booking = Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => $customer->id,
            'agency_id' => $agency->id,
            'currency' => Currency::XOF,
        ]);

        $payment = BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => 50000,
            'currency' => Currency::XOF,
            'status' => $status,
            'transaction_id' => $txn,
            'payment_type' => BookingPaymentType::Deposit,
            'metadata' => ['gateway' => ['provider' => 'wave', 'transaction_id' => $txn]],
        ]);

        Integration::factory()->create([
            'agency_id' => $agency->id,
            'provider' => 'wave',
            'is_active' => true,
            'credentials' => ['api_key' => 'k', 'webhook_secret' => $this->secret],
        ]);

        return $payment;
    }

    protected function signWave(string $body, string $secret, ?int $ts = null): string
    {
        $ts ??= time();
        $hmac = hash_hmac('sha256', $ts.'.'.$body, $secret);

        return "t={$ts},v1={$hmac}";
    }

    public function test_webhook_with_invalid_signature_returns_401_and_does_not_mutate(): void
    {
        $payment = $this->arrangePending();
        $payload = ['type' => 'checkout.session.completed', 'data' => ['id' => $payment->transaction_id]];
        $body = json_encode($payload);

        $response = $this->call(
            method: 'POST',
            uri: '/api/webhooks/payments/wave',
            parameters: $payload,
            cookies: [],
            files: [],
            server: ['CONTENT_TYPE' => 'application/json', 'HTTP_WAVE_SIGNATURE' => 't=1,v1=deadbeef'],
            content: $body,
        );

        $response->assertStatus(401);
        $this->assertSame(PaymentStatus::Pending, $payment->refresh()->status);
    }

    public function test_webhook_marks_paid_on_success(): void
    {
        $payment = $this->arrangePending();
        $payload = ['type' => 'checkout.session.completed', 'data' => ['id' => $payment->transaction_id, 'amount' => '50000', 'currency' => 'XOF']];
        $body = json_encode($payload);
        $sig = $this->signWave($body, $this->secret);

        $response = $this->call(
            method: 'POST',
            uri: '/api/webhooks/payments/wave',
            parameters: $payload,
            cookies: [],
            files: [],
            server: ['CONTENT_TYPE' => 'application/json', 'HTTP_WAVE_SIGNATURE' => $sig],
            content: $body,
        );

        $response->assertOk()->assertJsonPath('data.type', 'paid');
        $this->assertSame(PaymentStatus::Paid, $payment->refresh()->status);
        $this->assertNotNull($payment->paid_at);
    }

    public function test_webhook_is_idempotent_for_replays(): void
    {
        $payment = $this->arrangePending();
        $payload = ['type' => 'checkout.session.completed', 'data' => ['id' => $payment->transaction_id]];
        $body = json_encode($payload);
        $sig = $this->signWave($body, $this->secret);

        $server = ['CONTENT_TYPE' => 'application/json', 'HTTP_WAVE_SIGNATURE' => $sig];

        $this->call('POST', '/api/webhooks/payments/wave', $payload, [], [], $server, $body)->assertOk();
        $this->call('POST', '/api/webhooks/payments/wave', $payload, [], [], $server, $body)->assertOk();

        $payment->refresh();
        $events = $payment->metadata['gateway_events'] ?? [];
        $this->assertCount(1, $events, 'Expected exactly one recorded gateway event after replay.');
        $this->assertSame(PaymentStatus::Paid, $payment->status);
    }

    public function test_paid_payment_is_not_regressed_to_pending_on_late_event(): void
    {
        $payment = $this->arrangePending(status: PaymentStatus::Paid);
        $payload = ['type' => 'checkout.session.pending', 'data' => ['id' => $payment->transaction_id]];
        $body = json_encode($payload);
        $sig = $this->signWave($body, $this->secret);

        $this->call('POST', '/api/webhooks/payments/wave', $payload, [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_WAVE_SIGNATURE' => $sig,
        ], $body)->assertOk();

        $payment->refresh();
        $this->assertSame(PaymentStatus::Paid, $payment->status, 'paid → pending must be blocked.');
        $this->assertNotEmpty($payment->metadata['gateway_late_event'] ?? null, 'Late event should be logged in metadata.');
    }

    public function test_credentials_are_never_returned_in_resources(): void
    {
        $integration = Integration::factory()->create([
            'provider' => 'wave',
            'credentials' => ['api_key' => 'super_secret_key'],
        ]);

        $array = $integration->toArray();
        $this->assertArrayNotHasKey('credentials', $array);
    }
}

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
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;

/**
 * TCK-606 (ADR-0046, amendement du 2026-11-16) — une commande Lemon Squeezy ne solde par
 * `custom_data` que ce qui a été initié chez Lemon Squeezy par une intégration du propriétaire de
 * l'autorité, et au bon montant, dans la devise du checkout.
 */
class LemonSqueezyCustomDataTest extends ApiTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    /**
     * AC1 (M-1) — le chemin du paquet (autorité plateforme) ne solde pas un payable d'agence jamais
     * initié, ni l'URL à jeton d'une intégration LS d'une AUTRE agence, ni même celle de l'agence
     * propriétaire : un payable jamais initié ne se solde jamais par `custom_data`.
     */
    public function test_a_never_initiated_payable_is_never_settled_through_custom_data(): void
    {
        $agencyA = Agency::factory()->create();
        $payment = $this->payable($agencyA);
        $this->lsIntegration(null, 'platform_secret');
        $lsB = $this->lsIntegration(Agency::factory()->create(), 'secret_b');
        $lsA = $this->lsIntegration($agencyA, 'secret_a');

        app(PaymentGatewayService::class)->handleWebhookEvent('order_created', $this->order($payment, 'ord_platform', 10000, 'USD'));
        $this->assertNeverSettled($payment);

        $this->signedOrder($lsB, $this->order($payment, 'ord_b', 10000, 'USD'), 'secret_b')->assertOk();
        $this->assertNeverSettled($payment);

        $this->signedOrder($lsA, $this->order($payment, 'ord_a', 1500000, 'XOF'), 'secret_a')->assertOk();
        $this->assertNeverSettled($payment);
    }

    /**
     * AC2 — le montant se contrôle toujours : 14 000 XOF contre un checkout de 15 000 → 422
     * `payment.amount_short` ; une autre devise que celle du checkout → 422 ; 15 000 → `paid`.
     */
    public function test_the_order_amount_is_always_checked_in_the_checkout_currency(): void
    {
        $agency = Agency::factory()->create();
        $ls = $this->lsIntegration($agency, 'secret_a');
        $payment = $this->initiated($this->payable($agency), $ls, 15000);

        $this->signedOrder($ls, $this->order($payment, 'ord_short', 1400000, 'XOF'), 'secret_a')
            ->assertStatus(422)->assertJsonPath('code', 'payment.amount_short');
        $this->assertSame(PaymentStatus::Pending, $payment->refresh()->status);

        $this->signedOrder($ls, $this->order($payment, 'ord_usd', 1500000, 'USD'), 'secret_a')
            ->assertStatus(422)->assertJsonPath('code', 'payment.currency_mismatch');
        $this->assertSame(PaymentStatus::Pending, $payment->refresh()->status);

        $this->signedOrder($ls, $this->order($payment, 'ord_ok', 1500000, 'XOF'), 'secret_a')->assertOk();
        $this->assertSame(PaymentStatus::Paid, $payment->refresh()->status);
    }

    /**
     * AC3 (m-1) — l'intégration LS de l'agence A solde, par son URL, le payable de A qu'elle a
     * initié ; le même `custom_data` désignant un payable de B (initié par l'intégration LS de B)
     * ne le touche pas.
     */
    public function test_an_agency_lemon_squeezy_integration_settles_only_what_it_initiated(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $lsA = $this->lsIntegration($agencyA, 'secret_a');
        $lsB = $this->lsIntegration($agencyB, 'secret_b');
        $paymentA = $this->initiated($this->payable($agencyA), $lsA, 15000);
        $paymentB = $this->initiated($this->payable($agencyB), $lsB, 15000);

        $this->signedOrder($lsA, $this->order($paymentB, 'ord_cross', 1500000, 'XOF'), 'secret_a')->assertOk();
        $this->assertNeverSettled($paymentB);

        $this->signedOrder($lsA, $this->order($paymentA, 'ord_own', 1500000, 'XOF'), 'secret_a')->assertOk();
        $this->assertSame(PaymentStatus::Paid, $paymentA->refresh()->status);
    }

    /**
     * Le propriétaire de l'intégration qui a INITIÉ doit être celui de l'autorité : un checkout
     * ouvert par l'intégration LS de A ne se solde pas par le chemin du paquet (plateforme).
     */
    public function test_a_payable_initiated_by_an_agency_is_not_settled_by_the_platform_path(): void
    {
        $agency = Agency::factory()->create();
        $this->lsIntegration(null, 'platform_secret');
        $payment = $this->initiated($this->payable($agency), $this->lsIntegration($agency, 'secret_a'), 15000);

        app(PaymentGatewayService::class)->handleWebhookEvent('order_created', $this->order($payment, 'ord_platform', 1500000, 'XOF'));

        $this->assertNeverSettled($payment);
    }

    private function assertNeverSettled(BookingPayment $payment): void
    {
        $payment->refresh();
        $this->assertSame(PaymentStatus::Pending, $payment->status);
        $this->assertEmpty($payment->metadata['gateway_events'] ?? []);
    }

    private function payable(Agency $agency): BookingPayment
    {
        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $booking = Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => Customer::factory()->create(['agency_id' => $agency->id])->id,
            'agency_id' => $agency->id,
            'currency' => Currency::XOF,
        ]);

        return BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => 15000,
            'currency' => Currency::XOF,
            'status' => PaymentStatus::Pending,
            'transaction_id' => null,
            'payment_type' => BookingPaymentType::Deposit,
            'metadata' => [],
        ]);
    }

    /** Le checkout tel que `recordInitiation` l'écrit : UUID du checkout, intégration, montant et devise figés. */
    private function initiated(BookingPayment $payment, Integration $integration, float $amount): BookingPayment
    {
        $checkout = 'chk_'.$payment->id;
        $payment->forceFill([
            'transaction_id' => $checkout,
            'metadata' => [
                'gateway_expected_amount' => $amount,
                'gateway' => [
                    'provider' => 'lemon_squeezy',
                    'transaction_id' => $checkout,
                    'integration_id' => $integration->id,
                    'transactions' => [[
                        'transaction_id' => $checkout,
                        'provider' => 'lemon_squeezy',
                        'integration_id' => $integration->id,
                        'amount' => $amount,
                        'currency' => 'XOF',
                    ]],
                ],
            ],
        ])->save();

        return $payment;
    }

    private function lsIntegration(?Agency $agency, string $secret): Integration
    {
        return Integration::factory()->create([
            'agency_id' => $agency?->id,
            'provider' => 'lemon_squeezy',
            'is_active' => true,
            'credentials' => ['api_key' => 'k', 'signing_secret' => $secret, 'store_id' => 's', 'variant_id' => 'v'],
        ]);
    }

    /** @return array<string, mixed> */
    private function order(BookingPayment $payment, string $orderId, int $totalCents, string $currency): array
    {
        return [
            'meta' => ['event_name' => 'order_created'],
            'data' => [
                'id' => $orderId,
                'attributes' => [
                    'total' => $totalCents,
                    'currency' => $currency,
                    'status' => 'paid',
                    'first_order_item' => [
                        'custom_data' => ['payment_id' => (string) $payment->id, 'payment_type' => BookingPayment::class],
                    ],
                ],
            ],
        ];
    }

    /** @param  array<string, mixed>  $payload */
    private function signedOrder(Integration $integration, array $payload, string $secret): TestResponse
    {
        $body = (string) json_encode($payload);

        return $this->call('POST', '/api/webhooks/payments/lemon_squeezy/'.$integration->webhook_token, [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_SIGNATURE' => hash_hmac('sha256', $body, $secret),
        ], $body);
    }
}

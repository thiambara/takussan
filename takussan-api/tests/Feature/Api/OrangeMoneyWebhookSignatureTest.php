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
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;

/**
 * TCK-699 (pistes P12.03) — le webhook Orange Money n'est accepté que signé, par `X-OM-Signature`,
 * avec le secret de l'intégration que désigne son URL (`OrangeMoneyDriver::handleWebhook`).
 *
 * Jusqu'ici, seul un cas de signature VALIDE existait (`PaymentDriverTest`) : retirer la
 * vérification laissait la suite verte, et le webhook acceptait n'importe quel corps. Chaque refus
 * vérifie que le paiement n'a pas bougé ; le cas signé par le bon secret prouve que la fixture
 * passe bien jusqu'au rapprochement, sans quoi un refus pourrait venir d'ailleurs.
 */
class OrangeMoneyWebhookSignatureTest extends ApiTestCase
{
    use RefreshDatabase;

    private const SECRET_A = 'om_secret_agency_a';

    private const SECRET_B = 'om_secret_agency_b';

    private const TXN = 'omt_agency_a';

    public function test_a_webhook_signed_with_the_secret_of_its_integration_settles_the_payment(): void
    {
        [$payment, $integrationA] = $this->arrange();
        $body = $this->paidBody();

        $this->postWebhook($integrationA, $body, hash_hmac('sha256', $body, self::SECRET_A))->assertOk();

        $this->assertSame(PaymentStatus::Paid, $payment->refresh()->status);
    }

    public function test_a_wrong_signature_is_refused_and_mutates_nothing(): void
    {
        [$payment, $integrationA] = $this->arrange();
        $body = $this->paidBody();

        $response = $this->postWebhook($integrationA, $body, hash_hmac('sha256', $body.' ', self::SECRET_A));

        $this->assertRefusedAndUntouched($response, $payment);
    }

    public function test_a_missing_signature_is_refused_and_mutates_nothing(): void
    {
        [$payment, $integrationA] = $this->arrange();

        $response = $this->postWebhook($integrationA, $this->paidBody(), null);

        $this->assertRefusedAndUntouched($response, $payment);
    }

    public function test_the_secret_of_another_agency_is_refused_and_mutates_nothing(): void
    {
        [$payment, $integrationA] = $this->arrange();
        $body = $this->paidBody();

        $response = $this->postWebhook($integrationA, $body, hash_hmac('sha256', $body, self::SECRET_B));

        $this->assertRefusedAndUntouched($response, $payment);
    }

    // ─── Helpers ─────────────────────────────────────────────────

    private function assertRefusedAndUntouched(TestResponse $response, BookingPayment $payment): void
    {
        $response->assertStatus(401)->assertJsonPath('message', __('errors.webhook.signature_invalid'));

        $payment->refresh();
        $this->assertSame(PaymentStatus::Pending, $payment->status);
        $this->assertNull($payment->paid_at);
        $this->assertArrayNotHasKey('gateway_events', $payment->metadata);
    }

    /**
     * Deux agences, chacune avec son intégration Orange Money et son secret. Celle de B est créée
     * en premier ; le paiement en attente est celui de A, initié par l'intégration de A.
     *
     * @return array{0: BookingPayment, 1: Integration}
     */
    private function arrange(): array
    {
        $this->integration(Agency::factory()->create(), self::SECRET_B);

        $agencyA = Agency::factory()->create();
        $integrationA = $this->integration($agencyA, self::SECRET_A);

        $property = Property::factory()->create(['agency_id' => $agencyA->id]);
        $booking = Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => Customer::factory()->create(['agency_id' => $agencyA->id])->id,
            'agency_id' => $agencyA->id,
            'currency' => Currency::XOF,
        ]);

        $payment = BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => 50000,
            'currency' => Currency::XOF,
            'status' => PaymentStatus::Pending,
            'transaction_id' => self::TXN,
            'payment_type' => BookingPaymentType::Deposit,
            'metadata' => ['gateway' => [
                'provider' => 'orange_money',
                'transaction_id' => self::TXN,
                'integration_id' => $integrationA->id,
            ]],
        ]);

        return [$payment, $integrationA];
    }

    private function integration(Agency $agency, string $secret): Integration
    {
        return Integration::factory()->create([
            'agency_id' => $agency->id,
            'provider' => 'orange_money',
            'is_active' => true,
            'credentials' => [
                'client_id' => 'om_client', 'client_secret' => 'om_client_secret',
                'merchant_key' => 'mk', 'webhook_secret' => $secret,
            ],
        ]);
    }

    private function paidBody(): string
    {
        return json_encode(['pay_token' => self::TXN, 'status' => 'SUCCESS', 'amount' => 50000, 'currency' => 'XOF']);
    }

    private function postWebhook(Integration $integration, string $body, ?string $signature): TestResponse
    {
        $server = ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'];
        if ($signature !== null) {
            $server['HTTP_X_OM_SIGNATURE'] = $signature;
        }

        return $this->call('POST', '/api/webhooks/payments/orange_money/'.$integration->webhook_token, [], [], [], $server, $body);
    }
}

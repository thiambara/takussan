<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\Currency;
use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Integration;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;

/**
 * TCK-285 / TCK-293 (ADR-0046) — le webhook de paiement ne valide qu'avec le secret de
 * l'intégration que désigne son URL, et ne rapproche que dans l'agence de celle-ci.
 *
 * Ces cas étaient SUSPENDUS depuis le 2026-08-15 par une sonde qui lisait la source de
 * `handleWebhook` (ardoise D-50). Mesuré alors, et re-mesuré le 2026-10-08 sur `dev` : le secret de
 * B faisait passer à `paid` le paiement de A (200), et le secret légitime de A était rejeté (401).
 * La sonde est retirée avec le correctif : ces tests sont désormais la garde.
 *
 * `PaymentWebhookTest` ne pouvait pas le voir : il ne crée qu'UNE intégration.
 */
class PaymentWebhookMultiTenantTest extends ApiTestCase
{
    use RefreshDatabase;

    private const SECRET_A = 'wave_secret_agency_a';

    private const SECRET_B = 'wave_secret_agency_b';

    /** AC1 — l'URL de A, signée avec le secret de B : refusé, rien n'est muté. */
    public function test_the_secret_of_another_agency_must_not_authenticate_a_webhook(): void
    {
        [$payment, $integrationA] = $this->arrangeTwoAgencies();

        $response = $this->postSignedWebhook($integrationA, $this->payloadFor($payment->transaction_id), self::SECRET_B);

        $response->assertStatus(401);
        $this->assertSame(PaymentStatus::Pending, $payment->refresh()->status);
        $this->assertArrayNotHasKey('gateway_events', $payment->metadata);
    }

    /** AC2 — l'URL de A, signée avec le secret de A : le paiement de A passe. */
    public function test_the_own_secret_of_the_agency_authenticates_its_webhook(): void
    {
        [$payment, $integrationA] = $this->arrangeTwoAgencies();

        $response = $this->postSignedWebhook($integrationA, $this->payloadFor($payment->transaction_id), self::SECRET_A);

        $response->assertOk();
        $this->assertSame(PaymentStatus::Paid, $payment->refresh()->status);
    }

    /**
     * AC3 — B, avec SON URL et SON secret (une signature parfaitement valide), vise la transaction
     * d'un acompte de A : 200 pour le fournisseur, mais rien n'est rapproché.
     */
    public function test_a_valid_webhook_of_another_agency_never_reaches_the_booking_payment_of_a(): void
    {
        [$payment, , $integrationB] = $this->arrangeTwoAgencies();

        $this->postSignedWebhook($integrationB, $this->payloadFor($payment->transaction_id), self::SECRET_B)->assertOk();

        $this->assertSame(PaymentStatus::Pending, $payment->refresh()->status);
        $this->assertArrayNotHasKey('gateway_events', $payment->metadata);
    }

    /** AC3, second chemin — l'échéance de loyer, rattachée à l'agence par son bail. */
    public function test_a_valid_webhook_of_another_agency_never_reaches_the_lease_payment_of_a(): void
    {
        [, $integrationA, $integrationB, $agencyA] = $this->arrangeTwoAgencies();
        $lease = Lease::factory()->create(['agency_id' => $agencyA->id, 'status' => LeaseStatus::Active, 'currency' => Currency::XOF]);
        $due = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => 150_000,
            'currency' => Currency::XOF,
            'status' => PaymentStatus::Pending,
            'transaction_id' => 'cs_lease_a',
            'metadata' => ['gateway' => ['provider' => 'wave', 'transaction_id' => 'cs_lease_a']],
        ]);

        $this->postSignedWebhook($integrationB, $this->payloadFor('cs_lease_a'), self::SECRET_B)->assertOk();
        $this->assertSame(PaymentStatus::Pending, $due->refresh()->status);

        $this->postSignedWebhook($integrationA, $this->payloadFor('cs_lease_a'), self::SECRET_A)->assertOk();
        $this->assertSame(PaymentStatus::Paid, $due->refresh()->status);
    }

    /** AC3, troisième chemin — la facture, rattachée par son `agency_id`. */
    public function test_a_valid_webhook_of_another_agency_never_reaches_the_invoice_of_a(): void
    {
        [, $integrationA, $integrationB, $agencyA] = $this->arrangeTwoAgencies();
        $invoice = Invoice::factory()->sent()->create([
            'agency_id' => $agencyA->id,
            'transaction_id' => 'cs_invoice_a',
            'metadata' => ['gateway' => ['provider' => 'wave', 'transaction_id' => 'cs_invoice_a']],
        ]);

        $this->postSignedWebhook($integrationB, $this->payloadFor('cs_invoice_a'), self::SECRET_B)->assertOk();
        $this->assertSame(InvoiceStatus::Sent, $invoice->refresh()->status);

        $this->postSignedWebhook($integrationA, $this->payloadFor('cs_invoice_a'), self::SECRET_A)->assertOk();
        $this->assertSame(InvoiceStatus::Paid, $invoice->refresh()->status);
    }

    /**
     * AC3, chemin de l'historique — un checkout ANTÉRIEUR de A (son identifiant n'est plus dans
     * `transaction_id`, il est dans `gateway.transactions`) n'est pas atteignable par B.
     */
    public function test_the_checkout_history_of_a_is_out_of_reach_of_another_agency(): void
    {
        [$payment, , $integrationB] = $this->arrangeTwoAgencies();
        $payment->forceFill(['metadata' => ['gateway' => [
            'provider' => 'wave',
            'transaction_id' => 'cs_current',
            'transactions' => [['transaction_id' => 'cs_old_a', 'provider' => 'wave', 'amount' => 50000]],
        ]], 'transaction_id' => 'cs_current'])->save();

        $this->postSignedWebhook($integrationB, $this->payloadFor('cs_old_a'), self::SECRET_B)->assertOk();

        $this->assertSame(PaymentStatus::Pending, $payment->refresh()->status);
    }

    // ─── Helpers ─────────────────────────────────────────────────

    /**
     * Deux agences, chacune avec son intégration Wave active et son propre secret. Celle de B est
     * créée EN PREMIER : c'est elle que l'ancienne résolution non scopée retenait.
     *
     * @return array{0: BookingPayment, 1: Integration, 2: Integration, 3: Agency, 4: Agency}
     */
    private function arrangeTwoAgencies(): array
    {
        $agencyB = Agency::factory()->create();
        $integrationB = $this->integration($agencyB, self::SECRET_B);

        $agencyA = Agency::factory()->create();
        $payment = $this->pendingPayment($agencyA, 'cs_wave_agency_a');
        $integrationA = $this->integration($agencyA, self::SECRET_A);

        return [$payment, $integrationA, $integrationB, $agencyA, $agencyB];
    }

    private function payloadFor(string $transactionId): string
    {
        return json_encode([
            'type' => 'checkout.session.completed',
            'data' => ['id' => $transactionId],
        ]);
    }

    private function postSignedWebhook(Integration $integration, string $body, string $secret): TestResponse
    {
        $ts = time();
        $signature = "t={$ts},v1=".hash_hmac('sha256', $ts.'.'.$body, $secret);

        return $this->call(
            'POST',
            '/api/webhooks/payments/wave/'.$integration->webhook_token,
            [], [], [],
            [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_ACCEPT' => 'application/json',
                'HTTP_WAVE_SIGNATURE' => $signature,
            ],
            $body,
        );
    }

    private function integration(Agency $agency, string $secret): Integration
    {
        return Integration::factory()->create([
            'agency_id' => $agency->id,
            'provider' => 'wave',
            'is_active' => true,
            'credentials' => ['api_key' => 'k', 'webhook_secret' => $secret],
        ]);
    }

    private function pendingPayment(Agency $agency, string $txn): BookingPayment
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
            'amount' => 50000,
            'currency' => Currency::XOF,
            'status' => PaymentStatus::Pending,
            'transaction_id' => $txn,
            'payment_type' => BookingPaymentType::Deposit,
            'metadata' => ['gateway' => ['provider' => 'wave', 'transaction_id' => $txn]],
        ]);
    }
}

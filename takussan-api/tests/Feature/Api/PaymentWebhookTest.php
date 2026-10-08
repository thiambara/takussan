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
use App\Services\Lease\LateFeeCalculator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

class PaymentWebhookTest extends TestCase
{
    use LeaseDueFixture;
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

    public function test_lemon_squeezy_webhook_rejects_missing_signature(): void
    {
        // The generic proxy route is NOT covered by the LS package's signature
        // middleware, so an unsigned forged body must be rejected (401) rather
        // than marking a payment paid.
        Integration::factory()->create([
            'agency_id' => null,
            'provider' => 'lemon_squeezy',
            'is_active' => true,
            'credentials' => ['api_key' => 'k', 'signing_secret' => 'ls_secret', 'store_id' => 's', 'variant_id' => 'v'],
        ]);

        $payload = ['meta' => ['event_name' => 'order_created'], 'data' => ['id' => 'ord_forged', 'attributes' => []]];
        $body = json_encode($payload);

        $this->call('POST', '/api/webhooks/payments/lemon_squeezy', $payload, [], [], [
            'CONTENT_TYPE' => 'application/json',
        ], $body)->assertStatus(401);
    }

    public function test_lemon_squeezy_webhook_accepts_valid_signature(): void
    {
        Integration::factory()->create([
            'agency_id' => null,
            'provider' => 'lemon_squeezy',
            'is_active' => true,
            'credentials' => ['api_key' => 'k', 'signing_secret' => 'ls_secret', 'store_id' => 's', 'variant_id' => 'v'],
        ]);

        $payload = ['meta' => ['event_name' => 'order_created'], 'data' => ['id' => 'ord_ok', 'attributes' => []]];
        $body = json_encode($payload);
        $sig = hash_hmac('sha256', $body, 'ls_secret');

        $this->call('POST', '/api/webhooks/payments/lemon_squeezy', $payload, [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_SIGNATURE' => $sig,
        ], $body)->assertOk();
    }

    public function test_webhook_rejects_underpaid_amount(): void
    {
        $payment = $this->arrangePending();
        // Gateway reports a paid amount below the 50000 invoiced — must not settle.
        $payload = ['type' => 'checkout.session.completed', 'data' => ['id' => $payment->transaction_id, 'amount' => '10000', 'currency' => 'XOF']];
        $body = json_encode($payload);
        $sig = $this->signWave($body, $this->secret);

        $this->call('POST', '/api/webhooks/payments/wave', $payload, [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_WAVE_SIGNATURE' => $sig,
        ], $body)->assertStatus(422);

        $this->assertSame(PaymentStatus::Pending, $payment->refresh()->status);
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

    // ─── TCK-593 — statut après paiement d'une échéance de loyer ───────────────

    /**
     * AC6 — réglage activé : un webhook de 157 500 solde loyer ET pénalité dans la même
     * sauvegarde ; 150 000 sur ce checkout est un sous-paiement.
     */
    public function test_succes_avec_penalite_incluse_pose_late_fee_paid_at(): void
    {
        $ctx = $this->leaseDue(['late_fee_online_collection' => true]);
        $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);
        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/initiate", ['provider' => 'wave'])->assertOk();

        $this->waveWebhook('spy_txn_1', 150_000)->assertStatus(422);
        $this->assertSame(PaymentStatus::Late, $ctx['payment']->refresh()->status);

        $this->waveWebhook('spy_txn_1', 157_500)->assertOk();

        $payment = $ctx['payment']->refresh();
        $this->assertSame(PaymentStatus::Paid, $payment->status);
        $this->assertNotNull($payment->paid_at);
        $this->assertNotNull($payment->late_fee_paid_at);
        $this->assertSame(0.0, $payment->lateFeeOutstanding());
    }

    /**
     * TCK-593 (vérification adverse, V1) — une pénalité FRACTIONNAIRE, calculée par le vrai
     * calculateur, ne fait plus refuser le paiement encaissé. Base : 150 000 − 33 333 déjà payés =
     * 116 667 ; 5 % = 5 833,35 → arrondie à 5 833 (XOF, sans sous-unité). Avant : le fournisseur
     * encaissait 122 500 (il arrondit à l'entier), le montant figé valait 122 500,35, et le webhook
     * était refusé en 422 — le locataire, débité, voyait encore « Payer ».
     */
    public function test_une_penalite_fractionnaire_est_encaissee_au_montant_demande(): void
    {
        $ctx = $this->leaseDue(['late_fee_online_collection' => true], [
            'status' => PaymentStatus::PartiallyPaid,
            'metadata' => ['paid_amount' => 33_333],
            'late_fee_amount' => null,
            'late_fee_applied_at' => null,
        ]);

        $fee = app(LateFeeCalculator::class)->apply($ctx['payment']->fresh());
        $this->assertSame(5_833.0, $fee);

        $spy = $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);
        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/initiate", ['provider' => 'wave'])->assertOk();

        // Ce que le pilote transmet est un entier d'unités, égal au montant figé.
        $this->assertSame(12_250_000, $spy->calls[0]['amount_cents']);
        $this->assertEquals(122_500, $ctx['payment']->refresh()->metadata['gateway_expected_amount']);

        $this->waveWebhook('spy_txn_1', 122_500)->assertOk();

        $payment = $ctx['payment']->refresh();
        $this->assertSame(PaymentStatus::Paid, $payment->status);
        $this->assertNotNull($payment->late_fee_paid_at);
    }

    /**
     * V1 — une pénalité fractionnaire DÉJÀ enregistrée (avant l'arrondi du calculateur) : c'est
     * `amountDue` qui arrondit, avant de figer et de transmettre.
     */
    public function test_une_penalite_fractionnaire_deja_enregistree_est_arrondie_au_montant_du(): void
    {
        $ctx = $this->leaseDue(['late_fee_online_collection' => true], ['late_fee_amount' => 7_500.05]);
        $spy = $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);
        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/initiate", ['provider' => 'wave'])->assertOk();

        $this->assertSame(15_750_000, $spy->calls[0]['amount_cents']);
        $this->assertEquals(157_500, $ctx['payment']->refresh()->metadata['gateway_expected_amount']);

        $this->waveWebhook('spy_txn_1', 157_500)->assertOk();
        $this->assertSame(PaymentStatus::Paid, $ctx['payment']->refresh()->status);
    }

    /** V1 — l'arrondi est au plus proche, la moitié vers le haut : 7 500,5 → 7 501. */
    public function test_la_penalite_est_arrondie_a_l_unite_la_moitie_vers_le_haut(): void
    {
        $up = $this->leaseDue(null, ['amount' => 150_010, 'status' => PaymentStatus::Pending, 'late_fee_amount' => null, 'late_fee_applied_at' => null]);
        $down = $this->leaseDue(null, ['amount' => 150_009, 'status' => PaymentStatus::Pending, 'late_fee_amount' => null, 'late_fee_applied_at' => null]);

        $this->assertSame(7_501.0, app(LateFeeCalculator::class)->compute($up['payment']->fresh()));
        $this->assertSame(7_500.0, app(LateFeeCalculator::class)->compute($down['payment']->fresh()));
    }

    /**
     * AC5 — réglage désactivé : 150 000 solde le loyer, la pénalité reste due et le statut ne la
     * dit pas (`paid`, ni `late` ni `partially_paid`).
     */
    public function test_succes_sans_penalite_incluse_laisse_la_penalite_due(): void
    {
        $ctx = $this->leaseDue(['late_fee_online_collection' => false]);
        $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);
        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/initiate", ['provider' => 'wave'])->assertOk();

        $this->waveWebhook('spy_txn_1', 150_000)->assertOk();

        $payment = $ctx['payment']->refresh();
        $this->assertSame(PaymentStatus::Paid, $payment->status);
        $this->assertNotNull($payment->paid_at);
        $this->assertSame('7500.00', (string) $payment->late_fee_amount);
        $this->assertNull($payment->late_fee_paid_at);
        $this->assertSame(7_500.0, $payment->lateFeeOutstanding());
    }

    /**
     * AC9 — un webhook `failed` ne fige pas l'échéance : elle reste `late`, l'échec est tracé, et
     * l'agent peut ensuite enregistrer le paiement en espèces.
     */
    public function test_echec_en_ligne_laisse_l_echeance_ouverte(): void
    {
        $ctx = $this->leaseDue();
        $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);
        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/initiate", ['provider' => 'wave'])->assertOk();

        $this->waveWebhook('spy_txn_1', null, 'checkout.session.payment_failed')->assertOk();

        $payment = $ctx['payment']->refresh();
        $this->assertSame(PaymentStatus::Late, $payment->status);
        $this->assertNotEmpty($payment->metadata['gateway']['last_failed_at'] ?? null);

        Sanctum::actingAs($ctx['agent']);
        $this->postJson("/api/lease-payments/{$payment->id}/mark-paid", [])->assertOk();
        $this->assertSame(PaymentStatus::Paid, $payment->refresh()->status);
    }
}

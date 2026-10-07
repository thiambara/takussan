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
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

class PaymentGatewayInitiateTest extends TestCase
{
    use LeaseDueFixture;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Http::preventStrayRequests();

        // Default: respond OK to common gateway URLs. Individual tests override.
        Http::fake([
            'api.wave.com/*' => Http::response([
                'id' => 'cs_wave_123',
                'wave_launch_url' => 'https://pay.wave.com/c/cs_wave_123',
                'amount' => '50000',
                'currency' => 'XOF',
            ], 200),
            'api.orange.com/*' => Http::response([
                'pay_token' => 'om_token_abc',
                'payment_url' => 'https://webpayment.orange-money.com/pay/om_token_abc',
                'notif_token' => 'om_notif_abc',
            ], 200),
        ]);
    }

    /**
     * Build a fully-populated booking + payment with active integration.
     *
     * @return array{owner: User, booking: Booking, payment: BookingPayment, agency: Agency}
     */
    protected function makeContext(string $provider = 'wave', string $currency = 'XOF', array $credentials = []): array
    {
        $agency = Agency::factory()->create();
        $owner = User::factory()->create(['agency_id' => $agency->id]);
        $property = Property::factory()->create([
            'user_id' => $owner->id,
            'agency_id' => $agency->id,
        ]);
        $customer = Customer::factory()->create();
        $booking = Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => $customer->id,
            'agency_id' => $agency->id,
            'currency' => Currency::tryFrom($currency) ?? Currency::XOF,
        ]);

        $payment = BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => 50000,
            'currency' => Currency::tryFrom($currency) ?? Currency::XOF,
            'status' => PaymentStatus::Pending,
            'payment_type' => BookingPaymentType::Deposit,
        ]);

        Integration::factory()->create([
            'agency_id' => $agency->id,
            'provider' => $provider,
            'is_active' => true,
            'credentials' => $credentials !== [] ? $credentials : [
                'api_key' => 'wave_test_key',
                'webhook_secret' => 'wave_secret',
                'access_token' => 'om_token',
                'merchant_key' => 'om_merchant',
                'store_id' => 'ls_store',
                'variant_id' => 'ls_variant',
                'signing_secret' => 'ls_secret',
            ],
        ]);

        return ['owner' => $owner, 'booking' => $booking, 'payment' => $payment, 'agency' => $agency];
    }

    public function test_owner_can_initiate_wave_checkout(): void
    {
        $ctx = $this->makeContext('wave');
        Sanctum::actingAs($ctx['owner']);

        $response = $this->postJson("/api/booking-payments/{$ctx['payment']->id}/initiate", [
            'provider' => 'wave',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.provider', 'wave')
            ->assertJsonPath('data.checkout_url', 'https://pay.wave.com/c/cs_wave_123')
            ->assertJsonPath('data.transaction_id', 'cs_wave_123');

        $ctx['payment']->refresh();
        $this->assertSame('cs_wave_123', $ctx['payment']->transaction_id);
        $this->assertSame('wave', $ctx['payment']->metadata['gateway']['provider'] ?? null);
    }

    public function test_owner_can_initiate_orange_money_checkout(): void
    {
        $ctx = $this->makeContext('orange_money');
        Sanctum::actingAs($ctx['owner']);

        $response = $this->postJson("/api/booking-payments/{$ctx['payment']->id}/initiate", [
            'provider' => 'orange_money',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.provider', 'orange_money')
            ->assertJsonPath('data.transaction_id', 'om_token_abc');
    }

    public function test_initiate_returns_404_when_integration_missing(): void
    {
        $agency = Agency::factory()->create();
        $owner = User::factory()->create(['agency_id' => $agency->id]);
        $property = Property::factory()->create(['user_id' => $owner->id, 'agency_id' => $agency->id]);
        $booking = Booking::factory()->create(['property_id' => $property->id, 'agency_id' => $agency->id]);
        $payment = BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'currency' => Currency::XOF,
        ]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/booking-payments/{$payment->id}/initiate", ['provider' => 'wave'])
            ->assertNotFound();
    }

    public function test_initiate_rejects_xof_for_lemon_squeezy(): void
    {
        $ctx = $this->makeContext('lemon_squeezy', 'XOF');
        Sanctum::actingAs($ctx['owner']);

        $response = $this->postJson("/api/booking-payments/{$ctx['payment']->id}/initiate", [
            'provider' => 'lemon_squeezy',
        ]);

        $response->assertStatus(422)->assertJsonPath('code', 'payment.xof_requires_local_provider');
        $this->assertStringContainsString('Lemon Squeezy', (string) $response->json('message'));
    }

    public function test_initiate_rejects_eur_for_wave(): void
    {
        $ctx = $this->makeContext('wave', 'EUR');
        Sanctum::actingAs($ctx['owner']);

        $this->postJson("/api/booking-payments/{$ctx['payment']->id}/initiate", [
            'provider' => 'wave',
        ])->assertStatus(422);
    }

    public function test_random_user_cannot_initiate(): void
    {
        $ctx = $this->makeContext('wave');
        $intruder = User::factory()->create();

        Sanctum::actingAs($intruder);

        $this->postJson("/api/booking-payments/{$ctx['payment']->id}/initiate", [
            'provider' => 'wave',
        ])->assertForbidden();
    }

    public function test_initiate_only_uses_agency_scoped_integration(): void
    {
        $ctx = $this->makeContext('wave');
        $otherAgency = Agency::factory()->create();
        // Add another integration on a different agency — must not be picked.
        Integration::factory()->create([
            'agency_id' => $otherAgency->id,
            'provider' => 'wave',
            'is_active' => true,
            'credentials' => ['api_key' => 'foreign'],
        ]);

        Sanctum::actingAs($ctx['owner']);

        $this->postJson("/api/booking-payments/{$ctx['payment']->id}/initiate", [
            'provider' => 'wave',
        ])->assertOk();
    }

    // ─── TCK-593 — ce qui est dû, et une seule fois ─────────────────────────

    /**
     * AC3 (réglage désactivé) — la pénalité restant due n'entre pas dans le checkout : le pilote
     * reçoit le loyer seul, ×100.
     */
    public function test_penalite_exclue_quand_l_agence_ne_l_encaisse_pas_en_ligne(): void
    {
        $ctx = $this->leaseDue(['late_fee_online_collection' => false]);
        $spy = $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);

        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/initiate", ['provider' => 'wave'])
            ->assertOk();

        $this->assertSame(15_000_000, $spy->calls[0]['amount_cents']);
        $meta = $ctx['payment']->refresh()->metadata;
        $this->assertEquals(150_000, $meta['gateway_expected_amount']);
        $this->assertFalse($meta['late_fee_included']);
    }

    /** AC3 (réglage activé) — loyer et pénalité ensemble : 157 500 ×100. */
    public function test_penalite_incluse_quand_l_agence_l_encaisse_en_ligne(): void
    {
        $ctx = $this->leaseDue(['late_fee_online_collection' => true]);
        $spy = $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);

        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/initiate", ['provider' => 'wave'])
            ->assertOk();

        $this->assertSame(15_750_000, $spy->calls[0]['amount_cents']);
        $meta = $ctx['payment']->refresh()->metadata;
        $this->assertEquals(157_500, $meta['gateway_expected_amount']);
        $this->assertTrue($meta['late_fee_included']);
    }

    /** AC4 — une agence créée par l'API n'a pas la clé : la pénalité n'entre pas. */
    public function test_agence_neuve_n_encaisse_pas_la_penalite_en_ligne(): void
    {
        $creator = User::factory()->create();
        Sanctum::actingAs($creator);
        $agencyId = $this->postJson('/api/agencies', ['name' => 'Agence neuve '.uniqid()])
            ->assertCreated()
            ->json('data.id');

        $ctx = $this->leaseDue();
        // L'échéance de l'AC3, rattachée à l'agence que l'API vient de créer.
        $ctx['lease']->update(['agency_id' => $agencyId]);
        Integration::query()->update(['agency_id' => $agencyId]);
        $agency = Agency::query()->findOrFail($agencyId);
        $this->assertArrayNotHasKey('late_fee_online_collection', $agency->settings ?? []);
        $this->assertFalse($agency->collectsLateFeesOnline());

        $spy = $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);

        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/initiate", ['provider' => 'wave'])
            ->assertOk();

        $this->assertSame(15_000_000, $spy->calls[0]['amount_cents']);
    }

    /** AC8 — une échéance payée, remboursée, ou un acompte payé : 409, zéro appel au pilote. */
    public function test_initiation_refusee_sur_une_echeance_deja_payee(): void
    {
        $paid = $this->leaseDue(null, ['status' => PaymentStatus::Paid, 'paid_at' => now()]);
        $spy = $this->spyDriver();
        Sanctum::actingAs($paid['tenant']);

        $this->postJson("/api/lease-payments/{$paid['payment']->id}/initiate", ['provider' => 'wave'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'payment.not_payable');

        $refunded = $this->leaseDue(null, ['status' => PaymentStatus::Refunded, 'paid_at' => now()]);
        Sanctum::actingAs($refunded['tenant']);
        $this->postJson("/api/lease-payments/{$refunded['payment']->id}/initiate", ['provider' => 'wave'])
            ->assertStatus(409);

        $booking = $this->makeContext('wave');
        $booking['payment']->update(['status' => PaymentStatus::Paid, 'paid_at' => now()]);
        Sanctum::actingAs($booking['owner']);
        $this->postJson("/api/booking-payments/{$booking['payment']->id}/initiate", ['provider' => 'wave'])
            ->assertStatus(409);

        // Passe 2, N7 — sur un LOYER, la garde de statut s'observe aussi : remboursé, pénalité due,
        // réglage activé, le reste dû est 0 mais `amountDue` vaudrait 7 500 sans elle.
        $refundedWithFee = $this->leaseDue(['late_fee_online_collection' => true], ['status' => PaymentStatus::Refunded, 'paid_at' => now()]);
        Sanctum::actingAs($refundedWithFee['tenant']);
        $this->postJson("/api/lease-payments/{$refundedWithFee['payment']->id}/initiate", ['provider' => 'wave'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'payment.not_payable');

        // Vérification adverse (AC8a) — l'échéance `refunded` ci-dessus est refusée par la garde
        // du montant nul : `lease_payments` n'a pas de `refund_amount`, son reste dû est donc
        // toujours 0. C'est un acompte remboursé INTÉGRALEMENT (`refund_amount = amount`, reste
        // dû = 50 000) qui éprouve la garde de STATUT.
        $refundedBooking = $this->makeContext('wave');
        $refundedBooking['payment']->update([
            'status' => PaymentStatus::Refunded,
            'paid_at' => now(),
            'refund_amount' => 50000,
        ]);
        $this->assertEquals(50000, $refundedBooking['payment']->refresh()->remaining_amount);
        Sanctum::actingAs($refundedBooking['owner']);
        $this->postJson("/api/booking-payments/{$refundedBooking['payment']->id}/initiate", ['provider' => 'wave'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'payment.not_payable');

        $this->assertSame([], $spy->calls, 'Le pilote ne doit jamais être appelé sur un paiement réglé.');
    }

    /** AC8 — réessayer après un échec est le cas nominal. */
    public function test_initiation_acceptee_sur_une_echeance_en_echec(): void
    {
        $ctx = $this->leaseDue(null, ['status' => PaymentStatus::Failed]);
        $spy = $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);

        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/initiate", ['provider' => 'wave'])
            ->assertOk();

        $this->assertCount(1, $spy->calls);
    }

    /**
     * AC7 — le montant est figé à l'initiation. Un checkout ouvert à 150 000 (réglage activé, AVANT
     * la pénalité) se solde par un webhook de 150 000 arrivé APRÈS la pénalité ; 140 000 reste
     * refusé. Désactiver le réglage après un checkout à 157 500 ne fait pas refuser 157 500.
     */
    public function test_webhook_compare_au_montant_fige_a_l_initiation(): void
    {
        // 1. Checkout ouvert avant la pénalité, réglage activé.
        $ctx = $this->leaseDue(['late_fee_online_collection' => true], [
            'status' => PaymentStatus::Pending,
            'late_fee_amount' => null,
            'late_fee_applied_at' => null,
        ]);
        $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);
        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/initiate", ['provider' => 'wave'])->assertOk();
        $this->assertEquals(150_000, $ctx['payment']->refresh()->metadata['gateway_expected_amount']);

        // 2. La pénalité tombe entre l'ouverture et le webhook.
        $ctx['payment']->forceFill([
            'late_fee_amount' => 7_500,
            'late_fee_applied_at' => now(),
            'status' => PaymentStatus::Late,
        ])->save();

        // 140 000 reste un sous-paiement du montant figé.
        $this->waveWebhook('spy_txn_1', 140_000)->assertStatus(422);
        $this->assertSame(PaymentStatus::Late, $ctx['payment']->refresh()->status);

        // 150 000 solde le loyer ; la pénalité n'était pas incluse, elle reste due.
        $this->waveWebhook('spy_txn_1', 150_000)->assertOk();
        $payment = $ctx['payment']->refresh();
        $this->assertSame(PaymentStatus::Paid, $payment->status);
        $this->assertNull($payment->late_fee_paid_at);
        $this->assertSame(7_500.0, $payment->lateFeeOutstanding());

        // 3. Checkout à 157 500, puis réglage désactivé : 157 500 n'est pas refusé.
        $other = $this->leaseDue(['late_fee_online_collection' => true]);
        Sanctum::actingAs($other['tenant']);
        $this->postJson("/api/lease-payments/{$other['payment']->id}/initiate", ['provider' => 'wave'])->assertOk();
        $other['agency']->update(['settings' => ['late_fee_online_collection' => false]]);

        $this->waveWebhook('spy_txn_2', 157_500)->assertOk();
        $settled = $other['payment']->refresh();
        $this->assertSame(PaymentStatus::Paid, $settled->status);
        $this->assertNotNull($settled->late_fee_paid_at);
    }
}

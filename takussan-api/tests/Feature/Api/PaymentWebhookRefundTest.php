<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\TaskStatus;
use App\Models\Integration;
use App\Models\Property;
use App\Models\Task;
use App\Models\User;
use App\Services\Booking\BookingRefundTaskService;
use App\Services\Payments\Dto\PaymentEvent;
use App\Services\Payments\Dto\PaymentStatus as DriverStatus;
use App\Services\Payments\Dto\WebhookAuthority;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Laravel\Sanctum\Sanctum;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * Pistes P39.01 à P39.03 — un remboursement reçu par webhook, sur un payable déjà soldé.
 *
 * Le remboursement passe par `applyEventToMatchingPayment()`, sous l'autorité de l'intégration
 * Wave de l'agence, et non par le nom d'événement Wave que devine `WaveDriver` : la page des
 * webhooks de Wave ne documente aucun événement de remboursement (P39.05). Les paiements, eux,
 * passent par le vrai webhook signé.
 */
class PaymentWebhookRefundTest extends TestCase
{
    use LeaseDueFixture, RefreshDatabase;

    private function initiate(int $paymentId)
    {
        return $this->postJson("/api/lease-payments/{$paymentId}/initiate", ['provider' => 'wave']);
    }

    private function refundEvent(string $transactionId, ?int $amount = null): int
    {
        $integration = Integration::query()->where('provider', 'wave')->where('is_active', true)->latest('id')->firstOrFail();
        $metadata = $amount === null ? [] : ['amount' => (string) $amount, 'currency' => 'XOF'];

        return app(PaymentGatewayService::class)->applyEventToMatchingPayment(
            new PaymentEvent('wave', PaymentEvent::TYPE_REFUNDED, $transactionId, $metadata, WebhookAuthority::of($integration)),
        );
    }

    /** @param  array<string, mixed>  $meta */
    private function duplicateEntry(array $meta, string $transactionId): array
    {
        foreach ($meta['gateway_duplicate_payment'] ?? [] as $entry) {
            if (($entry['transaction_id'] ?? null) === $transactionId) {
                return $entry;
            }
        }
        $this->fail("Aucune entrée de double encaissement pour {$transactionId}.");
    }

    // ── P39.01 (TCK-871) ────────────────────────────────────────────────────────────────────────

    public function test_rembourser_le_second_checkout_ne_rembourse_pas_le_loyer(): void
    {
        $ctx = $this->leaseDue();
        $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);

        $this->initiate($ctx['payment']->id)->assertOk();
        $this->travel(config('payments.checkout_reuse_minutes') + 1)->minutes();
        $this->initiate($ctx['payment']->id)->assertOk();
        $this->waveWebhook('spy_txn_1', 150_000)->assertOk();
        $this->waveWebhook('spy_txn_2', 150_000)->assertOk();

        $this->assertSame(1, $this->refundEvent('spy_txn_2', 150_000));

        $payment = $ctx['payment']->refresh();
        $this->assertSame(PaymentStatus::Paid, $payment->status, 'Le remboursement du doublon a remboursé le loyer.');
        $this->assertSame('spy_txn_1', $payment->metadata['gateway']['settled_by']);
        $this->assertEquals(150_000, $payment->paid_amount);
        $this->assertNotNull($this->duplicateEntry($payment->metadata, 'spy_txn_2')['refunded_at'] ?? null);
    }

    public function test_rembourser_le_checkout_paye_apres_des_especes_ne_rembourse_pas_le_loyer(): void
    {
        $ctx = $this->leaseDue();
        $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);
        $this->initiate($ctx['payment']->id)->assertOk();

        $this->travel(config('payments.checkout_reuse_minutes') + 1)->minutes();
        Sanctum::actingAs($ctx['agent']);
        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/mark-paid", [])->assertOk();
        $this->waveWebhook('spy_txn_1', 150_000)->assertOk();

        $this->refundEvent('spy_txn_1', 150_000);

        $payment = $ctx['payment']->refresh();
        $this->assertSame(PaymentStatus::Paid, $payment->status, 'Le remboursement du doublon a remboursé les espèces.');
        $this->assertSame(PaymentGatewayService::SETTLED_MANUALLY, $payment->metadata['gateway']['settled_by']);
        $this->assertNotNull($this->duplicateEntry($payment->metadata, 'spy_txn_1')['refunded_at'] ?? null);
    }

    public function test_temoin_rembourser_le_checkout_qui_a_solde_rembourse_le_loyer(): void
    {
        $ctx = $this->leaseDue();
        $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);
        $this->initiate($ctx['payment']->id)->assertOk();
        $this->waveWebhook('spy_txn_1', 150_000)->assertOk();

        $this->refundEvent('spy_txn_1', 150_000);

        $payment = $ctx['payment']->refresh();
        $this->assertSame(PaymentStatus::Refunded, $payment->status);
        $this->assertArrayNotHasKey('gateway_duplicate_payment', $payment->metadata);
    }

    // ── P39.02 (TCK-872) ────────────────────────────────────────────────────────────────────────

    public function test_un_encaissement_sur_une_echeance_remboursee_est_un_doublon_signale(): void
    {
        $ctx = $this->leaseDue();
        $admin = User::factory()->create(['agency_id' => $ctx['agency']->id]);
        $ctx['agency']->update(['primary_admin_id' => $admin->id]);
        $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);

        $this->initiate($ctx['payment']->id)->assertOk();
        $this->travel(config('payments.checkout_reuse_minutes') + 1)->minutes();
        $this->initiate($ctx['payment']->id)->assertOk();
        $this->waveWebhook('spy_txn_1', 150_000)->assertOk();
        $this->refundEvent('spy_txn_1', 150_000);
        $this->assertSame(PaymentStatus::Refunded, $ctx['payment']->refresh()->status);

        $this->waveWebhook('spy_txn_2', 150_000)->assertOk();

        $payment = $ctx['payment']->refresh();
        $this->assertSame(PaymentStatus::Refunded, $payment->status);
        $this->assertCount(1, $payment->metadata['gateway_duplicate_payment']);
        $this->assertEquals(150_000, $this->duplicateEntry($payment->metadata, 'spy_txn_2')['amount']);
        $this->assertSame(1, AppNotification::query()->where('user_id', $admin->id)
            ->where('code', 'payment.duplicate')->count());

        // Le rejeu du MÊME webhook n'ajoute rien.
        $this->waveWebhook('spy_txn_2', 150_000)->assertOk();
        $this->assertCount(1, $payment->refresh()->metadata['gateway_duplicate_payment']);
    }

    public function test_la_verification_forcee_du_reglement_rembourse_n_est_pas_un_doublon(): void
    {
        $ctx = $this->leaseDue();
        $spy = $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);
        $this->initiate($ctx['payment']->id)->assertOk();
        $this->waveWebhook('spy_txn_1', 150_000)->assertOk();
        $this->refundEvent('spy_txn_1', 150_000);

        // La session du fournisseur reste « réglée » après son remboursement.
        $spy->verifyStatus = DriverStatus::SUCCESS;
        app(PaymentGatewayService::class)->verify($ctx['payment']->refresh());

        $payment = $ctx['payment']->refresh();
        $this->assertSame(PaymentStatus::Refunded, $payment->status);
        $this->assertArrayNotHasKey('gateway_duplicate_payment', $payment->metadata);
    }

    // ── P39.03 (TCK-873) ────────────────────────────────────────────────────────────────────────

    /** Un acompte de 50 000 réglé en ligne, sur une réservation de l'agence de l'intégration Wave. */
    private function paidDepositOnline(): BookingPayment
    {
        $agency = Agency::factory()->create(['currency' => Currency::XOF]);
        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $booking = Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => Customer::factory()->create()->id,
            'agency_id' => $agency->id,
            'currency' => Currency::XOF,
        ]);
        $payment = BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => 50_000,
            'currency' => Currency::XOF,
            'status' => PaymentStatus::Pending,
            'transaction_id' => 'cs_deposit_1',
            'payment_type' => BookingPaymentType::Deposit,
            'metadata' => ['gateway' => ['provider' => 'wave', 'transaction_id' => 'cs_deposit_1']],
        ]);
        Integration::factory()->create([
            'agency_id' => $agency->id,
            'provider' => 'wave',
            'is_active' => true,
            'credentials' => ['api_key' => 'wave_key', 'webhook_secret' => $this->waveSecret],
        ]);

        $this->waveWebhook('cs_deposit_1', 50_000)->assertOk();
        $this->assertSame(PaymentStatus::Paid, $payment->refresh()->status);

        return $payment;
    }

    public function test_le_remboursement_d_un_acompte_ecrit_le_montant_et_clot_la_tache(): void
    {
        $payment = $this->paidDepositOnline();
        $task = app(BookingRefundTaskService::class)->openFor($payment->booking);
        $this->assertInstanceOf(Task::class, $task);
        $this->assertSame(TaskStatus::Open, $task->status);

        $this->refundEvent('cs_deposit_1', 50_000);

        $payment->refresh();
        $this->assertSame(PaymentStatus::Refunded, $payment->status);
        $this->assertEquals(50_000, $payment->refund_amount);
        $this->assertEquals(0, $payment->paid_amount);
        $this->assertSame(TaskStatus::Done, $task->refresh()->status);
    }

    public function test_le_remboursement_d_une_echeance_ecrit_le_montant_rembourse(): void
    {
        $ctx = $this->leaseDue();
        $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);
        $this->initiate($ctx['payment']->id)->assertOk();
        $this->waveWebhook('spy_txn_1', 150_000)->assertOk();

        $this->refundEvent('spy_txn_1', 40_000);

        $payment = $ctx['payment']->refresh();
        $this->assertSame(PaymentStatus::Refunded, $payment->status);
        $this->assertEquals(40_000, $payment->refund_amount);
        $this->assertEquals(110_000, $payment->paid_amount);
    }

    public function test_le_montant_rembourse_est_plafonne_et_vaut_le_montant_entier_a_defaut(): void
    {
        $ctx = $this->leaseDue();
        $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);
        $this->initiate($ctx['payment']->id)->assertOk();
        $this->waveWebhook('spy_txn_1', 150_000)->assertOk();
        $this->refundEvent('spy_txn_1', 400_000);
        $this->assertEquals(150_000, $ctx['payment']->refresh()->refund_amount);

        $other = $this->leaseDue();
        $other['payment']->update([
            'status' => PaymentStatus::Paid,
            'transaction_id' => 'cs_sans_montant',
            'metadata' => ['gateway' => ['provider' => 'wave', 'transaction_id' => 'cs_sans_montant', 'settled_by' => 'cs_sans_montant']],
        ]);
        $this->refundEvent('cs_sans_montant');
        $this->assertEquals(150_000, $other['payment']->refresh()->refund_amount);
        $this->assertEquals(0, $other['payment']->paid_amount);
    }

    // ── P39.04 (TCK-889) ────────────────────────────────────────────────────────────────────────

    public function test_un_remboursement_recu_avant_le_paiement_est_applique_au_paiement(): void
    {
        Log::spy();
        $ctx = $this->leaseDue();
        $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);
        $this->initiate($ctx['payment']->id)->assertOk();

        $this->assertSame(1, $this->refundEvent('spy_txn_1', 150_000));
        $payment = $ctx['payment']->refresh();
        $this->assertNotSame(PaymentStatus::Refunded, $payment->status);
        $this->assertSame('spy_txn_1', $payment->metadata['gateway']['pending_refund'][0]['transaction_id'] ?? null);
        Log::shouldHaveReceived('warning')->with('payment_webhook_refund_before_paid', \Mockery::on(
            fn (array $context): bool => ($context['transaction_id'] ?? null) === 'spy_txn_1',
        ))->once();

        $this->waveWebhook('spy_txn_1', 150_000)->assertOk();

        $payment = $ctx['payment']->refresh();
        $this->assertSame(PaymentStatus::Refunded, $payment->status, 'Le remboursement reçu avant le paiement a été perdu.');
        $this->assertEquals(150_000, $payment->refund_amount);
        $this->assertEquals(0, $payment->paid_amount);
        $this->assertArrayNotHasKey('pending_refund', $payment->metadata['gateway']);
    }

    public function test_un_remboursement_du_doublon_recu_avant_son_paiement_ne_rembourse_pas_le_loyer(): void
    {
        $ctx = $this->leaseDue();
        $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);
        $this->initiate($ctx['payment']->id)->assertOk();
        $this->travel(config('payments.checkout_reuse_minutes') + 1)->minutes();
        $this->initiate($ctx['payment']->id)->assertOk();
        $this->waveWebhook('spy_txn_1', 150_000)->assertOk();

        $this->refundEvent('spy_txn_2', 150_000);
        $this->waveWebhook('spy_txn_2', 150_000)->assertOk();

        $payment = $ctx['payment']->refresh();
        $this->assertSame(PaymentStatus::Paid, $payment->status);
        $this->assertEquals(150_000, $payment->paid_amount);
        $this->assertNotNull($this->duplicateEntry($payment->metadata, 'spy_txn_2')['refunded_at'] ?? null, 'Le remboursement du doublon reçu avant son paiement a été perdu.');
        $this->assertArrayNotHasKey('pending_refund', $payment->metadata['gateway']);
    }
}

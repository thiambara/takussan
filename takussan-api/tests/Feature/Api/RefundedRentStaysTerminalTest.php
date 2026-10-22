<?php

namespace Tests\Feature\Api;

use App\Models\Enums\PaymentStatus;
use App\Models\Integration;
use App\Models\LeasePayment;
use App\Services\Dashboard\CollectedPayments;
use App\Services\Payments\Dto\PaymentEvent;
use App\Services\Payments\Dto\WebhookAuthority;
use App\Services\Payments\LeasePaymentLinkService;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * TCK-1216 (P76.05, décision du porteur) — `refunded` reste terminal, ni dû ni payable : un loyer
 * remboursé ne redevient pas dû (un remboursement qui corrige un double encaissement ne doit rendre
 * aucun loyer dû), et aucune échéance neuve n'est créée automatiquement. Sous P76.02 (b), un
 * remboursement partiel reste `paid` et sort de cette garde.
 */
class RefundedRentStaysTerminalTest extends TestCase
{
    use LeaseDueFixture, RefreshDatabase;

    public function test_a_refunded_rent_is_neither_owed_nor_payable(): void
    {
        $ctx = $this->leaseDue();
        $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);
        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/initiate", ['provider' => 'wave'])->assertOk();
        $this->waveWebhook('spy_txn_1', 150_000)->assertOk();
        $dues = LeasePayment::query()->where('lease_id', $ctx['lease']->id)->count();

        $integration = Integration::query()->where('provider', 'wave')->where('agency_id', $ctx['agency']->id)->firstOrFail();
        app(PaymentGatewayService::class)->applyEventToMatchingPayment(new PaymentEvent(
            'wave', PaymentEvent::TYPE_REFUNDED, 'spy_txn_1', ['amount' => '150000', 'currency' => 'XOF'], WebhookAuthority::of($integration),
        ));

        $payment = $ctx['payment']->refresh();
        $this->assertSame(PaymentStatus::Refunded, $payment->status);

        // Ni dû : hors de l'impayé, des relances et des pénalités.
        $this->assertFalse(CollectedPayments::leaseOwed()->whereKey($payment->id)->exists(), 'Un loyer remboursé est redevenu dû.');

        // Ni payable : ni par la passerelle, ni par un lien de paiement.
        $this->assertFalse(app(PaymentGatewayService::class)->isPayable($payment));
        $this->assertFalse(app(LeasePaymentLinkService::class)->isPayableByNature($payment));
        $this->postJson("/api/lease-payments/{$payment->id}/initiate", ['provider' => 'wave'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'payment.not_payable');

        // Aucune échéance neuve n'est créée automatiquement.
        $this->assertSame($dues, LeasePayment::query()->where('lease_id', $ctx['lease']->id)->count());
    }
}

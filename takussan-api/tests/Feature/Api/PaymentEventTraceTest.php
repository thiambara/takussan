<?php

namespace Tests\Feature\Api;

use App\Models\Enums\PaymentStatus;
use App\Models\Integration;
use App\Services\Payments\Dto\PaymentEvent;
use App\Services\Payments\Dto\WebhookAuthority;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * TCK-961 (P39.06) — la trace d'un événement de passerelle reste sur SON entrée de
 * `gateway_events`, et un échec reçu sur la transaction qui a soldé l'échéance est ignoré.
 *
 * Avant : le `metadata` de chaque événement était fusionné à la racine du payable, si bien qu'un
 * `failed` ou un `refunded` reçu après le `paid` remplaçait `amount`, `currency` et `event` ; et ce
 * `failed` posait encore `gateway.last_failed_at` sur une échéance payée.
 */
class PaymentEventTraceTest extends TestCase
{
    use LeaseDueFixture, RefreshDatabase;

    /** @param  array<string, mixed>  $meta */
    private function entry(array $meta, string $transactionId, string $type): array
    {
        foreach ($meta['gateway_events'] ?? [] as $entry) {
            if (($entry['transaction_id'] ?? null) === $transactionId && ($entry['type'] ?? null) === $type) {
                return $entry;
            }
        }
        $this->fail("Aucune entrée `gateway_events` {$type} pour {$transactionId}.");
    }

    private function paidLease(): array
    {
        $ctx = $this->leaseDue();
        $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);
        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/initiate", ['provider' => 'wave'])->assertOk();
        $this->waveWebhook('spy_txn_1', 150_000)->assertOk();

        return $ctx;
    }

    public function test_le_metadata_d_un_evenement_est_range_sous_son_entree_et_non_a_la_racine(): void
    {
        $ctx = $this->paidLease();
        $this->waveWebhook('spy_txn_1', 150_000, 'checkout.session.payment_failed')->assertOk();

        $meta = $ctx['payment']->refresh()->metadata;
        $this->assertSame(PaymentStatus::Paid, $ctx['payment']->status);

        foreach (['event', 'amount', 'currency'] as $cle) {
            $this->assertArrayNotHasKey($cle, $meta, "`metadata.{$cle}` d'un événement est écrit à la racine du payable.");
        }
        $this->assertEquals(
            ['amount' => '150000', 'currency' => 'XOF', 'event' => 'checkout.session.completed'],
            $this->entry($meta, 'spy_txn_1', PaymentEvent::TYPE_PAID)['metadata'] ?? null,
            'Le règlement a perdu sa trace.',
        );
        $this->assertSame(
            'checkout.session.payment_failed',
            $this->entry($meta, 'spy_txn_1', PaymentEvent::TYPE_FAILED)['metadata']['event'] ?? null,
        );
    }

    public function test_un_remboursement_ne_remplace_pas_la_trace_du_reglement(): void
    {
        $ctx = $this->paidLease();
        $integration = Integration::query()->where('provider', 'wave')->where('is_active', true)->latest('id')->firstOrFail();
        app(PaymentGatewayService::class)->applyEventToMatchingPayment(new PaymentEvent(
            'wave', PaymentEvent::TYPE_REFUNDED, 'spy_txn_1', ['amount' => '150000', 'currency' => 'XOF', 'event' => 'refund'], WebhookAuthority::of($integration),
        ));

        $meta = $ctx['payment']->refresh()->metadata;
        $this->assertSame(PaymentStatus::Refunded, $ctx['payment']->status);
        $this->assertArrayNotHasKey('event', $meta);
        $this->assertSame('checkout.session.completed', $this->entry($meta, 'spy_txn_1', PaymentEvent::TYPE_PAID)['metadata']['event'] ?? null);
        $this->assertSame('refund', $this->entry($meta, 'spy_txn_1', PaymentEvent::TYPE_REFUNDED)['metadata']['event'] ?? null);
    }

    public function test_un_echec_sur_la_transaction_qui_a_solde_l_echeance_est_ignore(): void
    {
        $ctx = $this->paidLease();
        $this->waveWebhook('spy_txn_1', 150_000, 'checkout.session.payment_failed')->assertOk();

        $payment = $ctx['payment']->refresh();
        $this->assertSame(PaymentStatus::Paid, $payment->status);
        $this->assertSame('spy_txn_1', $payment->metadata['gateway']['settled_by'] ?? null);
        $this->assertNull($payment->metadata['gateway']['last_failed_at'] ?? null, '`last_failed_at` posé par l\'échec de la transaction qui a soldé l\'échéance.');
    }

    public function test_un_echec_sur_le_checkout_courant_d_une_echeance_ouverte_reste_trace(): void
    {
        $ctx = $this->leaseDue();
        $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);
        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/initiate", ['provider' => 'wave'])->assertOk();
        $this->waveWebhook('spy_txn_1', 150_000, 'checkout.session.payment_failed')->assertOk();

        $this->assertNotNull($ctx['payment']->refresh()->metadata['gateway']['last_failed_at'] ?? null);
    }
}

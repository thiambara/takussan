<?php

namespace Tests\Feature\Api;

use App\Models\Enums\PaymentStatus;
use App\Models\Integration;
use App\Models\LeasePayment;
use App\Services\Payments\Dto\PaymentEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * Piste P39.05 (TCK-890) — la table des événements Wave, relevée le 2026-10-18 sur
 * docs.wave.com/webhook. Un test par nom : chacun passe par le vrai pilote Wave, signature
 * comprise, sur une échéance ouverte dont le checkout `spy_txn_1` est en cours.
 */
class WaveWebhookEventTableTest extends TestCase
{
    use LeaseDueFixture, RefreshDatabase;

    /** @return array{payment: LeasePayment} */
    private function openCheckout(): array
    {
        $ctx = $this->leaseDue();
        $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);
        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/initiate", ['provider' => 'wave'])->assertOk();

        return $ctx;
    }

    public function test_checkout_session_completed_solde_l_echeance(): void
    {
        $ctx = $this->openCheckout();

        $this->waveWebhook('spy_txn_1', 150_000)->assertOk()->assertJsonPath('data.type', PaymentEvent::TYPE_PAID);

        $this->assertSame(PaymentStatus::Paid, $ctx['payment']->refresh()->status);
    }

    public function test_checkout_session_payment_failed_trace_l_echec(): void
    {
        $ctx = $this->openCheckout();

        $this->waveWebhook('spy_txn_1', null, 'checkout.session.payment_failed')->assertOk()
            ->assertJsonPath('data.type', PaymentEvent::TYPE_FAILED);

        $payment = $ctx['payment']->refresh();
        $this->assertSame(PaymentStatus::Late, $payment->status);
        $this->assertNotNull($payment->metadata['gateway']['last_failed_at'] ?? null);
    }

    public function test_test_test_event_rend_200_sans_effet(): void
    {
        Log::spy();
        $ctx = $this->openCheckout();
        $before = $ctx['payment']->refresh()->metadata;
        $integration = Integration::query()->where('provider', 'wave')->latest('id')->firstOrFail();

        $payload = ['type' => 'test.test_event', 'data' => []];
        $body = json_encode($payload);
        $ts = time();
        $sig = 't='.$ts.',v1='.hash_hmac('sha256', $ts.'.'.$body, $this->waveSecret);
        $this->call('POST', '/api/webhooks/payments/wave/'.$integration->webhook_token, $payload, [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_WAVE_SIGNATURE' => $sig,
        ], $body)->assertOk()->assertJsonPath('data.type', PaymentEvent::TYPE_IGNORED);

        $payment = $ctx['payment']->refresh();
        $this->assertSame(PaymentStatus::Late, $payment->status);
        $this->assertEquals($before, $payment->metadata);
        Log::shouldNotHaveReceived('log');
    }

    /** @return array<string, array{string}> */
    public static function ignoredEvents(): array
    {
        return [
            'merchant.payment_received' => ['merchant.payment_received'],
            'b2b.payment_received' => ['b2b.payment_received'],
            'b2b.payment_failed' => ['b2b.payment_failed'],
            'nom inconnu : checkout.session.refunded' => ['checkout.session.refunded'],
            'nom inconnu : refund.completed' => ['refund.completed'],
        ];
    }

    #[DataProvider('ignoredEvents')]
    public function test_un_nom_hors_de_la_table_est_journalise_et_ignore(string $type): void
    {
        Log::spy();
        $ctx = $this->openCheckout();
        $before = $ctx['payment']->refresh()->metadata;

        $this->waveWebhook('spy_txn_1', 150_000, $type)->assertOk()->assertJsonPath('data.type', PaymentEvent::TYPE_IGNORED);

        $payment = $ctx['payment']->refresh();
        $this->assertSame(PaymentStatus::Late, $payment->status, "« {$type} » a changé le statut de l'échéance.");
        $this->assertEquals($before, $payment->metadata);
        Log::shouldHaveReceived('log')->withArgs(
            fn (string $level, string $message, array $context = []): bool => $message === '[wave] webhook event ignored' && ($context['event'] ?? null) === $type,
        )->once();
    }
}

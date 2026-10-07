<?php

namespace Tests\Feature\Api;

use App\Contracts\Payments\PaymentDriverContract;
use App\Models\AppNotification;
use App\Models\Enums\PaymentStatus;
use App\Models\User;
use App\Services\Payments\Dto\CheckoutSession;
use App\Services\Payments\Dto\PaymentEvent;
use App\Services\Payments\Dto\PaymentStatus as DriverStatus;
use App\Services\Payments\PaymentGatewayService;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * TCK-593 (vérification adverse, V2 / V3 / V4) — « il ne peut pas payer deux fois », au-delà de
 * l'échéance déjà `paid` :
 *  - un checkout ouvert est RENDU au second clic, pas doublé, et le webhook d'un checkout
 *    antérieur retrouve encore son échéance ;
 *  - un règlement manuel est refusé tant qu'un checkout vit ;
 *  - un encaissement en ligne sur une échéance déjà réglée est MARQUÉ et signalé à l'agence, au
 *    lieu d'être avalé.
 */
class PaymentCheckoutReuseTest extends TestCase
{
    use LeaseDueFixture, RefreshDatabase;

    private function initiate(int $paymentId, string $provider = 'wave')
    {
        return $this->postJson("/api/lease-payments/{$paymentId}/initiate", ['provider' => $provider]);
    }

    public function test_un_double_clic_rend_le_meme_checkout(): void
    {
        $ctx = $this->leaseDue();
        $spy = $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);

        $first = $this->initiate($ctx['payment']->id)->assertOk()->json('data');
        $second = $this->initiate($ctx['payment']->id)->assertOk()->json('data');

        $this->assertCount(1, $spy->calls, 'Un second checkout a été ouvert alors que le premier vivait.');
        $this->assertSame($first['checkout_url'], $second['checkout_url']);
        $this->assertSame($first['transaction_id'], $second['transaction_id']);
    }

    public function test_un_autre_fournisseur_est_refuse_tant_que_le_checkout_vit(): void
    {
        $ctx = $this->leaseDue();
        $spy = $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);

        $this->initiate($ctx['payment']->id)->assertOk();
        $this->initiate($ctx['payment']->id, 'orange_money')
            ->assertStatus(409)
            ->assertJsonPath('message', __('payments.checkout_in_progress'));

        $this->assertCount(1, $spy->calls);
    }

    public function test_un_checkout_a_un_autre_montant_n_est_pas_rendu(): void
    {
        // Passe 2, N2 — un checkout ouvert à 150 000, puis l'agence active l'encaissement en ligne
        // de la pénalité : l'écran dit 157 500. Le second clic rendait le checkout à 150 000.
        $ctx = $this->leaseDue(['late_fee_online_collection' => false]);
        $spy = $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);
        $this->initiate($ctx['payment']->id)->assertOk();

        $ctx['agency']->update(['settings' => ['late_fee_online_collection' => true]]);
        $this->getJson("/api/leases/{$ctx['lease']->id}/payments")->assertJsonPath('data.0.amount_due', 157500);

        $this->travel(5)->minutes();
        $initiatedAt = Carbon::parse($ctx['payment']->refresh()->metadata['gateway']['initiated_at']);
        $this->initiate($ctx['payment']->id)
            ->assertStatus(409)
            ->assertJsonPath('message', __('payments.checkout_in_progress'))
            ->assertJsonPath('code', 'checkout_in_progress')
            ->assertJsonPath('checkout.amount', 150000)
            ->assertJsonPath('checkout.currency', 'XOF')
            ->assertJsonPath('checkout.age_minutes', 5)
            ->assertJsonPath('checkout.retry_after', $initiatedAt->addMinutes(config('payments.checkout_reuse_minutes'))->toIso8601String());
        $this->assertCount(1, $spy->calls);

        // Au même montant, le checkout est rendu tel quel.
        $ctx['agency']->update(['settings' => ['late_fee_online_collection' => false]]);
        $this->initiate($ctx['payment']->id)->assertOk()->assertJsonPath('data.transaction_id', 'spy_txn_1');
        $this->assertCount(1, $spy->calls);
    }

    public function test_un_checkout_expire_ou_en_echec_n_est_plus_reutilise(): void
    {
        $ctx = $this->leaseDue();
        $spy = $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);

        $this->initiate($ctx['payment']->id)->assertOk();

        // Échec rapporté : un nouveau checkout s'ouvre aussitôt.
        $this->waveWebhook('spy_txn_1', null, 'checkout.session.payment_failed')->assertOk();
        $this->initiate($ctx['payment']->id)->assertOk();
        $this->assertCount(2, $spy->calls);

        // Au-delà de la durée de vie : de même.
        $this->travel(config('payments.checkout_reuse_minutes') + 1)->minutes();
        $this->initiate($ctx['payment']->id)->assertOk();
        $this->assertCount(3, $spy->calls);

        $history = array_column($ctx['payment']->refresh()->metadata['gateway']['transactions'], 'transaction_id');
        $this->assertSame(['spy_txn_1', 'spy_txn_2', 'spy_txn_3'], $history);
    }

    public function test_l_echec_d_un_ancien_checkout_ne_ferme_pas_le_checkout_courant(): void
    {
        // Passe 2, N1 — checkout 1 abandonné, checkout 2 ouvert 31 min plus tard, puis l'échec du
        // 1 arrive : il fermait le 2, et le clic suivant ouvrait un TROISIÈME checkout vivant.
        $ctx = $this->leaseDue();
        $spy = $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);

        $this->initiate($ctx['payment']->id)->assertOk();
        $this->travel(config('payments.checkout_reuse_minutes') + 1)->minutes();
        $this->initiate($ctx['payment']->id)->assertOk();
        $this->waveWebhook('spy_txn_1', null, 'checkout.session.payment_failed')->assertOk();

        $this->assertSame('spy_txn_2', $this->initiate($ctx['payment']->id)->assertOk()->json('data.transaction_id'));
        $this->assertCount(2, $spy->calls);

        $gateway = $ctx['payment']->refresh()->metadata['gateway'];
        $this->assertArrayNotHasKey('last_failed_at', $gateway);
        $this->assertNotNull($gateway['transactions'][0]['failed_at'] ?? null, 'L\'échec est tracé sur l\'entrée du checkout 1.');

        // Le checkout 2 vit toujours : l'espèce reste refusée.
        Sanctum::actingAs($ctx['agent']);
        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/mark-paid", [])->assertStatus(409);

        // L'échec du checkout COURANT, lui, le ferme.
        $this->waveWebhook('spy_txn_2', null, 'checkout.session.payment_failed')->assertOk();
        Sanctum::actingAs($ctx['tenant']);
        $this->assertSame('spy_txn_3', $this->initiate($ctx['payment']->id)->assertOk()->json('data.transaction_id'));
    }

    public function test_le_webhook_d_un_checkout_anterieur_retrouve_son_echeance(): void
    {
        $ctx = $this->leaseDue();
        $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);

        $this->initiate($ctx['payment']->id)->assertOk();
        $this->travel(config('payments.checkout_reuse_minutes') + 1)->minutes();
        $this->initiate($ctx['payment']->id)->assertOk();
        $this->assertSame('spy_txn_2', $ctx['payment']->refresh()->transaction_id);

        // Le PREMIER checkout est payé : avant, son webhook ne retrouvait rien (200, aucune trace).
        $this->waveWebhook('spy_txn_1', 150_000)->assertOk();
        $this->assertSame(PaymentStatus::Paid, $ctx['payment']->refresh()->status);
    }

    public function test_le_second_checkout_paye_est_marque_double_encaissement_et_signale(): void
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
        $this->waveWebhook('spy_txn_2', 150_000)->assertOk();

        $payment = $ctx['payment']->refresh();
        $this->assertSame(PaymentStatus::Paid, $payment->status);
        $this->assertCount(1, $payment->metadata['gateway_duplicate_payment']);
        $this->assertSame('spy_txn_2', $payment->metadata['gateway_duplicate_payment'][0]['transaction_id']);
        $this->assertEquals(150_000, $payment->metadata['gateway_duplicate_payment'][0]['amount']);

        $this->assertSame(1, AppNotification::query()->where('user_id', $admin->id)
            ->where('title', __('payments.duplicate_payment.title'))->count());

        // Le rejeu du MÊME webhook n'ajoute rien.
        $this->waveWebhook('spy_txn_2', 150_000)->assertOk();
        $this->assertCount(1, $payment->refresh()->metadata['gateway_duplicate_payment']);
    }

    public function test_la_verification_forcee_du_meme_reglement_n_est_pas_un_doublon(): void
    {
        // La vérification forcée n'a pas la déduplication des webhooks : c'est `settled_by` qui
        // dit que le payable a été soldé par CE règlement.
        $ctx = $this->leaseDue();
        $driver = new class implements PaymentDriverContract
        {
            public function initiate(Model $payment, int $amountCents, string $currency, array $meta = []): CheckoutSession
            {
                return new CheckoutSession('https://pay.example/c/1', 'spy_txn_1', 'wave');
            }

            public function verify(string $externalId): DriverStatus
            {
                return new DriverStatus(DriverStatus::SUCCESS, $externalId, []);
            }

            public function handleWebhook(Request $request): PaymentEvent
            {
                throw new \LogicException('non utilisé');
            }
        };
        $this->partialMock(PaymentGatewayService::class, fn ($mock) => $mock->shouldReceive('driverFor')->andReturn($driver));

        Sanctum::actingAs($ctx['tenant']);
        $this->initiate($ctx['payment']->id)->assertOk();
        $this->getJson("/api/lease-payments/{$ctx['payment']->id}/verify")->assertOk();
        $this->assertSame(PaymentStatus::Paid, $ctx['payment']->refresh()->status);

        $this->getJson("/api/lease-payments/{$ctx['payment']->id}/verify")->assertOk();
        $this->assertArrayNotHasKey('gateway_duplicate_payment', $ctx['payment']->refresh()->metadata);
    }

    public function test_un_reglement_anterieur_a_settled_by_n_est_pas_son_propre_doublon(): void
    {
        // Passe 2, N4 — une échéance soldée par `verify()` AVANT le déploiement : ni `settled_by`
        // ni événement journalisé. Le webhook de CE règlement, arrivé après, était marqué doublon
        // et les admins prévenus « à rembourser ».
        $ctx = $this->leaseDue();
        $ctx['payment']->forceFill([
            'status' => PaymentStatus::Paid,
            'paid_at' => now(),
            'transaction_id' => 'legacy_txn',
            'metadata' => ['gateway' => [
                'provider' => 'wave',
                'transaction_id' => 'legacy_txn',
                'checkout_url' => 'https://pay.example/legacy',
                'initiated_at' => now()->subDays(2)->toIso8601String(),
            ]],
        ])->save();

        $this->waveWebhook('legacy_txn', 150_000)->assertOk();
        $this->assertArrayNotHasKey('gateway_duplicate_payment', $ctx['payment']->refresh()->metadata);

        // Le témoin : la même ligne réglée À LA MAIN (marque `manual`) — le webhook de son checkout
        // reste un doublon.
        $other = $this->leaseDue();
        $this->spyDriver();
        Sanctum::actingAs($other['tenant']);
        $this->initiate($other['payment']->id)->assertOk();
        $this->travel(config('payments.checkout_reuse_minutes') + 1)->minutes();
        Sanctum::actingAs($other['agent']);
        $this->postJson("/api/lease-payments/{$other['payment']->id}/mark-paid", [])->assertOk();
        $this->assertSame(PaymentGatewayService::SETTLED_MANUALLY, $other['payment']->refresh()->metadata['gateway']['settled_by']);
        $this->waveWebhook('spy_txn_1', 150_000)->assertOk();
        $this->assertCount(1, $other['payment']->refresh()->metadata['gateway_duplicate_payment']);
    }

    public function test_especes_refusees_tant_que_le_checkout_vit_puis_doublon_marque(): void
    {
        $ctx = $this->leaseDue();
        $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);
        $this->initiate($ctx['payment']->id)->assertOk();

        Sanctum::actingAs($ctx['agent']);
        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/mark-paid", [])
            ->assertStatus(409)
            ->assertJsonPath('message', __('payments.checkout_in_progress'));
        $this->assertSame(PaymentStatus::Late, $ctx['payment']->refresh()->status);

        // Le checkout expiré, l'espèce s'enregistre ; si le checkout est malgré tout payé, le
        // doublon est marqué au lieu d'être avalé.
        $this->travel(config('payments.checkout_reuse_minutes') + 1)->minutes();
        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/mark-paid", [])->assertOk();

        $this->waveWebhook('spy_txn_1', 150_000)->assertOk();
        $payment = $ctx['payment']->refresh();
        $this->assertSame(PaymentStatus::Paid, $payment->status);
        $this->assertSame('spy_txn_1', $payment->metadata['gateway_duplicate_payment'][0]['transaction_id']);
    }

    public function test_la_penalite_incluse_dans_un_checkout_ouvert_ne_se_regle_pas_a_l_agence(): void
    {
        // V4 — réglage activé : le checkout ouvert inclut la pénalité.
        $ctx = $this->leaseDue(['late_fee_online_collection' => true]);
        $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);
        $this->initiate($ctx['payment']->id)->assertOk();

        Sanctum::actingAs($ctx['agent']);
        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/late-fee/mark-paid", [])
            ->assertStatus(409)
            ->assertJsonPath('message', __('payments.checkout_in_progress'));
        $this->assertNull($ctx['payment']->refresh()->late_fee_paid_at);

        // Le témoin : réglage désactivé, le checkout n'inclut pas la pénalité — elle se règle.
        $other = $this->leaseDue(['late_fee_online_collection' => false]);
        Sanctum::actingAs($other['tenant']);
        $this->initiate($other['payment']->id)->assertOk();
        Sanctum::actingAs($other['agent']);
        $this->postJson("/api/lease-payments/{$other['payment']->id}/late-fee/mark-paid", [])->assertOk();
    }

    public function test_un_webhook_sans_echeance_laisse_une_trace_sans_donnee_personnelle(): void
    {
        $logged = [];
        Event::listen(MessageLogged::class, function (MessageLogged $e) use (&$logged): void {
            $logged[] = ['message' => $e->message, 'context' => $e->context];
        });

        $this->leaseDue();
        $this->waveWebhook('txn_inconnu_42', 150_000)->assertOk();

        $orphans = array_values(array_filter($logged, fn ($l) => $l['message'] === 'payment_webhook_unmatched'));
        $this->assertCount(1, $orphans);
        $this->assertSame(
            ['provider' => 'wave', 'transaction_id' => 'txn_inconnu_42', 'type' => 'paid'],
            $orphans[0]['context'],
        );
    }
}

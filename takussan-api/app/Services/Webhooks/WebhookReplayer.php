<?php

namespace App\Services\Webhooks;

use App\Http\Controllers\Webhook\LAfricaMobileSmsStatusController;
use App\Http\Controllers\Webhook\MtargetSmsStatusController;
use App\Http\Controllers\Webhook\OrangeSmsStatusController;
use App\Http\Controllers\Webhook\WhatsappStatusController;
use App\Models\Integration;
use App\Models\IntegrationWebhookLog;
use App\Models\User;
use App\Services\Notifications\Sms\DeliveryAttemptUpdater;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * TCK-602 (ADR-0051 §5) — rejoue une ligne du journal par le MÊME gestionnaire que la route.
 *
 * - Seule une ligne authentifiée, échouée ou non appariée, au corps entier, se rejoue
 *   ({@see IntegrationWebhookLog::isReplayable()}) : une ligne `rejected`, jamais.
 * - La requête est reconstituée depuis `body` déchiffré et les en-têtes gardés, et la signature est
 *   RE-VÉRIFIÉE quand le canal en a une : un octet altéré du corps fait échouer le rejeu.
 * - Un rejeu de paiement porte l'autorité de l'intégration du journal (ADR-0046 §5) : sans elle,
 *   rien ne se rapproche.
 * - Deux rejeux simultanés de la même ligne se sérialisent sur la ligne (`lockForUpdate`).
 */
class WebhookReplayer
{
    public function __construct(
        private readonly WebhookJournal $journal,
        private readonly PaymentGatewayService $gateway,
    ) {}

    public function replay(IntegrationWebhookLog $log, User $actor): IntegrationWebhookLog
    {
        return DB::transaction(function () use ($log, $actor): IntegrationWebhookLog {
            /** @var IntegrationWebhookLog $locked */
            $locked = IntegrationWebhookLog::query()->whereKey($log->getKey())->lockForUpdate()->firstOrFail();
            abort_code_unless($locked->isReplayable(), 422, 'webhook_log.not_replayable');

            $locked->forceFill([
                'attempts' => (int) $locked->attempts + 1,
                'replayed_at' => now(),
                'replayed_by_id' => $actor->getKey(),
            ])->save();

            $this->journal->resume($locked);
            $response = null;
            $error = null;
            try {
                // Un point de sauvegarde : un échec du gestionnaire défait ce qu'il a écrit sans
                // abandonner la transaction qui ferme la ligne (PostgreSQL, 25P02).
                $response = DB::transaction(fn (): Response => $this->dispatch($locked, $this->rebuild($locked)));
            } catch (Throwable $e) {
                $error = $e;
            }
            $this->journal->close($response, $error);

            $locked->refresh();
            activity('Admin')
                ->causedBy($actor)
                ->performedOn($locked)
                ->withProperties([
                    'channel' => $locked->channel,
                    'provider' => $locked->provider,
                    'status' => $locked->status,
                    'http_status' => $locked->http_status,
                    'attempts' => $locked->attempts,
                ])
                ->event('super_admin_webhook_replayed')
                ->log('super_admin_webhook_replayed');

            return $locked;
        });
    }

    private function dispatch(IntegrationWebhookLog $log, Request $request): Response
    {
        return match ($log->route_name) {
            'payments.webhook' => $this->replayPayment($log, $request),
            'lemon-squeezy.webhook' => $this->replayLemonSqueezyPackage($request),
            'sms.webhook.orange' => app(OrangeSmsStatusController::class)->process($request, app(DeliveryAttemptUpdater::class), $this->journal),
            'sms.webhook.mtarget' => app(MtargetSmsStatusController::class)->process($request, app(DeliveryAttemptUpdater::class), $this->journal),
            'sms.webhook.lafricamobile' => app(LAfricaMobileSmsStatusController::class)->process($request, app(DeliveryAttemptUpdater::class), $this->journal),
            'whatsapp.webhook.status' => app(WhatsappStatusController::class)->process($request, $this->journal),
            default => abort_code(422, 'webhook_log.not_replayable'),
        };
    }

    /**
     * L'intégration du journal, telle qu'elle est AUJOURD'HUI : active, du même fournisseur. Une
     * intégration désactivée ou supprimée depuis ne rejoue rien.
     */
    private function replayPayment(IntegrationWebhookLog $log, Request $request): Response
    {
        $integration = Integration::query()->whereKey($log->integration_id)->first();
        abort_code_if(
            $integration === null || ! $integration->is_active || $integration->provider !== $log->provider,
            422,
            'webhook_log.integration_unavailable',
        );

        $event = $this->gateway->handleWebhook($integration, $request);

        return response()->json(['data' => ['received' => true, 'type' => $event->type]]);
    }

    /**
     * La route du paquet Lemon Squeezy : le secret de la CONFIGURATION (plateforme) revérifie
     * `X-Signature`, comme le middleware du paquet, puis le même pont que l'écouteur.
     */
    private function replayLemonSqueezyPackage(Request $request): Response
    {
        $secret = (string) config('lemon-squeezy.signing_secret', '');
        $expected = hash_hmac('sha256', $request->getContent(), $secret);
        abort_code_unless($secret !== '' && hash_equals($expected, (string) $request->header('X-Signature', '')), 401, 'webhook.signature_invalid');

        $payload = $request->json()->all();
        $eventName = (string) ($payload['meta']['event_name'] ?? '');
        if (in_array($eventName, ['order_created', 'order_refunded', 'subscription_created'], true)) {
            $this->gateway->handleWebhookEvent($eventName, $payload);
        } else {
            $this->journal->annotate(['matched_count' => 0]);
        }

        return response()->json(['data' => ['received' => true]]);
    }

    private function rebuild(IntegrationWebhookLog $log): Request
    {
        $body = (string) $log->body;
        $method = $log->http_method ?: 'POST';
        $query = [];
        if ($method === 'GET') {
            parse_str($body, $query);
            $body = '';
        }

        $request = Request::create('/webhooks/replay', $method, $query, [], [], [], $body);
        foreach ((array) $log->headers as $name => $value) {
            $request->headers->set((string) $name, (string) $value);
        }

        return $request;
    }
}

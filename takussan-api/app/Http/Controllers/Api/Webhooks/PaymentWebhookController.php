<?php

namespace App\Http\Controllers\Api\Webhooks;

use App\Http\Controllers\Base\Controller;
use App\Services\Admin\IntegrationService;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Public webhook receiver for Wave / Orange Money / Lemon Squeezy.
 *
 * TCK-293 (ADR-0046) — chaque intégration de paiement a SA propre URL,
 * `webhooks/payments/{provider}/{jeton}`. Le jeton désigne l'intégration ; son secret vérifie la
 * signature (dans le pilote, avant toute lecture du corps qui agit) ; le rapprochement ne sort pas
 * de son agence. Un jeton inconnu, d'un autre fournisseur ou d'une intégration désactivée rend le
 * MÊME 404, sans rien muter.
 *
 * Lemon Squeezy webhooks are normally received by the package's own
 * `webhooks/lemon-squeezy` route, which validates `X-Signature` upstream
 * and dispatches Laravel events. An agency's own Lemon Squeezy store posts
 * to its integration URL here, signed with that integration's secret.
 *
 * Idempotence is enforced inside `PaymentGatewayService::applyEventToMatchingPayment()`
 * by deduping on `(provider, transaction_id, type)` recorded in the
 * payment's `metadata.gateway_events`.
 */
class PaymentWebhookController extends Controller
{
    public function __construct(
        protected PaymentGatewayService $gateway,
        protected IntegrationService $integrations,
    ) {}

    public function __invoke(Request $request, string $provider, string $token): JsonResponse
    {
        $integration = $this->gateway->resolveWebhookIntegration($provider, $token);
        abort_code_if($integration === null, 404, 'webhook.endpoint_unknown');

        $event = $this->gateway->handleWebhook($integration, $request);
        $this->integrations->recordWebhook($integration->provider, $request->all(), 'processed', $event->type);

        return $this->json([
            'data' => [
                'received' => true,
                'provider' => $event->provider,
                'transaction_id' => $event->transactionId,
                'type' => $event->type,
            ],
        ]);
    }

    /**
     * TCK-293 (ADR-0046 §8) — l'ancienne URL sans jeton. Elle ne lit ni ne mute rien, et n'a pas
     * de repli « première intégration active » : ce repli était le défaut.
     */
    public function gone(): JsonResponse
    {
        abort_code(410, 'webhook.endpoint_gone');
    }
}

<?php

namespace App\Http\Controllers\Api\Webhooks;

use App\Http\Controllers\Base\Controller;
use App\Models\Enums\PaymentProvider;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Public webhook receiver for Wave / Orange Money / (fallback) Lemon Squeezy.
 *
 * Lemon Squeezy webhooks are normally received by the package's own
 * `webhooks/lemon-squeezy` route, which validates `X-Signature` upstream
 * and dispatches Laravel events. This generic endpoint stays available
 * as a safety net for setups that route everything through one URL.
 *
 * Idempotence is enforced inside `PaymentGatewayService::applyEventToMatchingPayment()`
 * by deduping on `(provider, transaction_id, type)` recorded in the
 * payment's `metadata.gateway_events`.
 */
class PaymentWebhookController extends Controller
{
    public function __construct(protected PaymentGatewayService $gateway) {}

    public function __invoke(Request $request, string $provider): JsonResponse
    {
        $providerEnum = PaymentProvider::tryFrom($provider);
        abort_unless($providerEnum, 404, 'Unknown provider.');

        $event = $this->gateway->handleWebhook($providerEnum, $request);

        return $this->json([
            'data' => [
                'received' => true,
                'provider' => $event->provider,
                'transaction_id' => $event->transactionId,
                'type' => $event->type,
            ],
        ]);
    }
}

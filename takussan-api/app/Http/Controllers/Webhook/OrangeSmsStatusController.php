<?php

namespace App\Http\Controllers\Webhook;

use App\Http\Controllers\Controller;
use App\Services\Notifications\Sms\DeliveryAttemptUpdater;
use App\Services\Notifications\Sms\SmsResult;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-102 — Inbound DLR from Orange Sénégal SMS API.
 *
 * Payload shape (JSON):
 * ```
 * {
 *   "deliveryInfoNotification": {
 *     "callbackData": "<resourceURL>",
 *     "deliveryInfo": {
 *       "address": "tel:+221770000000",
 *       "deliveryStatus": "DeliveredToTerminal" | "DeliveryImpossible" | ...
 *     }
 *   }
 * }
 * ```
 *
 * Auth model: signed Laravel route (`signed` middleware), random URL
 * token in config + IP allowlist via `restrict.ip:orange`. Idempotent:
 * matching `provider_message_id` on `delivery_attempts`.
 */
class OrangeSmsStatusController extends Controller
{
    public function __invoke(Request $request, DeliveryAttemptUpdater $updater): JsonResponse
    {
        $token = (string) config('sms.webhook_url_token', '');
        if ($token === '' || ! hash_equals($token, (string) $request->route('token'))) {
            abort(404);
        }

        $payload = $request->json()->all();
        $info = $payload['deliveryInfoNotification']['deliveryInfo'] ?? [];
        $providerStatus = (string) ($info['deliveryStatus'] ?? '');
        $callback = (string) ($payload['deliveryInfoNotification']['callbackData'] ?? '');
        $resource = (string) ($info['link'] ?? $callback);
        $providerMessageId = $resource !== ''
            ? basename(parse_url($resource, PHP_URL_PATH) ?: $resource)
            : '';
        if ($providerMessageId === '') {
            abort(404);
        }
        $newStatus = match ($providerStatus) {
            'DeliveredToTerminal' => SmsResult::STATUS_DELIVERED,
            'DeliveryImpossible',
            'DeliveryNotificationNotSupported',
            'MessageWaiting' => SmsResult::STATUS_FAILED,
            default => SmsResult::STATUS_FAILED,
        };
        $deliveredAt = $newStatus === SmsResult::STATUS_DELIVERED ? now() : null;
        $updated = $updater->applyStatus(
            provider: 'orange',
            providerMessageId: $providerMessageId,
            newStatus: $newStatus,
            failureReason: $newStatus === SmsResult::STATUS_FAILED ? $providerStatus : null,
            deliveredAt: $deliveredAt,
        );
        if (! $updated) {
            // Silent 404 — payload didn't match any tracked attempt.
            abort(404);
        }

        return new JsonResponse(['ok' => true]);
    }
}

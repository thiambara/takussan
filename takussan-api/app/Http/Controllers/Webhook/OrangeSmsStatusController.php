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
 * Auth model — CE QUI EST RÉELLEMENT EN PLACE (mesuré le 2026-08-15,
 * cf. ardoise D-49) :
 *
 *   1. un jeton aléatoire dans l'URL (`config('sms.webhook_url_token')`),
 *      comparé par `hash_equals` ci-dessous — échec fermé : jeton vide → 404 ;
 *   2. une allowlist d'IP, via le middleware `restrict.ip:orange` déclaré
 *      dans `routes/api/sms-webhooks.php` — échec fermé : liste vide → 403.
 *
 * ⚠ IL N'Y A **AUCUNE VÉRIFICATION DE SIGNATURE** sur cet endpoint, ni
 * cryptographique, ni via le middleware `signed` de Laravel. Ce docblock
 * annonçait « signed Laravel route (`signed` middleware) » : c'était faux —
 * seule la route LAfricaMobile porte `signed` (sms-webhooks.php:29), parce
 * que son URL est générée par message. Les webhooks Wave, Orange Money,
 * Lemon Squeezy et WhatsApp vérifient chacun une empreinte ; celui-ci et
 * celui de Mtarget, non.
 *
 * *Un commentaire qui décrit une protection absente est pire que pas de
 * commentaire : il dispense le lecteur d'aller vérifier.* Ne pas ajouter de
 * vérification de signature sans avoir établi qu'Orange en émet une — si ce
 * n'est pas le cas, on casse la réception des accusés de livraison et le
 * diagnostic partira du côté de l'opérateur. La décision est ouverte en D-49.
 *
 * Idempotent: matching `provider_message_id` on `delivery_attempts`.
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

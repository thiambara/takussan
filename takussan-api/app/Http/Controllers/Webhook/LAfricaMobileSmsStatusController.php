<?php

namespace App\Http\Controllers\Webhook;

use App\Http\Controllers\Controller;
use App\Services\Notifications\Sms\DeliveryAttemptUpdater;
use App\Services\Notifications\Sms\SmsResult;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-102 — Inbound DLR from LAfricaMobile (LAMPUSH v2.3).
 *
 * Note: LAM uses a GET callback (not POST). Query params:
 *   push_id, ret_id, to, status, text.
 * Status codes: SENT=4, DELIVRD=6, EXPIRED=12, UNKNOWN=16,
 *   REJECTD=23, UNDELIVERED=2.
 *
 * The route includes the AppNotification id passed at send time
 * (per-message ret_url), the random URL token, AND the Laravel
 * signed-route guard.
 */
class LAfricaMobileSmsStatusController extends Controller
{
    public function __invoke(Request $request, DeliveryAttemptUpdater $updater): JsonResponse
    {
        $token = (string) config('sms.webhook_url_token', '');
        if ($token === '' || ! hash_equals($token, (string) $request->route('token'))) {
            abort(404);
        }
        if (! $request->hasValidSignature()) {
            abort(403, 'Invalid signature');
        }
        $pushId = (string) $request->query('push_id', '');
        $statusCode = (int) $request->query('status', 0);
        $statusText = (string) $request->query('text', '');
        $notificationId = $request->route('notification');
        if ($pushId === '') {
            abort(404);
        }
        $newStatus = match ($statusCode) {
            6 => SmsResult::STATUS_DELIVERED,
            4 => SmsResult::STATUS_SENT,
            default => SmsResult::STATUS_FAILED,
        };
        $deliveredAt = $newStatus === SmsResult::STATUS_DELIVERED ? now() : null;
        $updated = $updater->applyStatus(
            provider: 'lafricamobile',
            providerMessageId: $pushId,
            newStatus: $newStatus,
            hintNotificationId: is_numeric($notificationId) ? (int) $notificationId : null,
            failureReason: $newStatus === SmsResult::STATUS_FAILED ? $statusText : null,
            deliveredAt: $deliveredAt,
        );
        if (! $updated) {
            abort(404);
        }

        return new JsonResponse(['ok' => true]);
    }
}

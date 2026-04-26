<?php

namespace App\Http\Controllers\Webhook;

use App\Http\Controllers\Controller;
use App\Services\Notifications\Sms\DeliveryAttemptUpdater;
use App\Services\Notifications\Sms\SmsResult;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-102 — Inbound DLR from Mtarget. POST form-urlencoded with:
 *   MsgId, Status (3=delivered, others=failed), StatusText,
 *   DestinationAdress, DeliveryDateTime.
 *
 * Configured at the Mtarget account level — fixed URL per env.
 */
class MtargetSmsStatusController extends Controller
{
    public function __invoke(Request $request, DeliveryAttemptUpdater $updater): JsonResponse
    {
        $token = (string) config('sms.webhook_url_token', '');
        if ($token === '' || ! hash_equals($token, (string) $request->route('token'))) {
            abort(404);
        }

        $providerMessageId = (string) $request->input('MsgId', '');
        $statusCode = (int) $request->input('Status', -1);
        $statusText = (string) $request->input('StatusText', '');
        $destination = (string) $request->input('DestinationAdress', '');

        if ($providerMessageId === '') {
            abort(404);
        }

        // Mtarget billing tickets carry a `|<msisdn>` suffix added by our
        // driver to disambiguate batched recipients. Strip it before lookup.
        $matchId = $providerMessageId;
        if ($destination !== '' && str_contains($matchId, '|')) {
            [$root] = explode('|', $matchId, 2);
            $matchId = $root.'|+'.$destination;
        }
        $newStatus = match (true) {
            $statusCode === 3 => SmsResult::STATUS_DELIVERED,
            default => SmsResult::STATUS_FAILED,
        };
        $deliveredAt = $newStatus === SmsResult::STATUS_DELIVERED ? now() : null;
        $updated = $updater->applyStatus(
            provider: 'mtarget',
            providerMessageId: $matchId,
            newStatus: $newStatus,
            failureReason: $newStatus === SmsResult::STATUS_FAILED ? $statusText : null,
            deliveredAt: $deliveredAt,
        ) || $updater->applyStatus(
            provider: 'mtarget',
            providerMessageId: $providerMessageId,
            newStatus: $newStatus,
            failureReason: $newStatus === SmsResult::STATUS_FAILED ? $statusText : null,
            deliveredAt: $deliveredAt,
        );
        if (! $updated) {
            abort(404);
        }

        return new JsonResponse(['ok' => true]);
    }
}

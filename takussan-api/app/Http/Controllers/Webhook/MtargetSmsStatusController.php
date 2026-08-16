<?php

namespace App\Http\Controllers\Webhook;

use App\Http\Controllers\Controller;
use App\Services\Notifications\Sms\DeliveryAttemptUpdater;
use App\Services\Notifications\Sms\Dlr\MtargetTicketMatcher;
use App\Services\Notifications\Sms\SmsResult;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * TCK-102 — Inbound DLR from Mtarget. POST form-urlencoded with:
 *   MsgId, Status (3=delivered, others=failed), StatusText,
 *   DestinationAdress, DeliveryDateTime.
 *
 * Configured at the Mtarget account level — fixed URL per env.
 *
 * TCK-294 — **This route is on its way out.** Mtarget emits no signature
 * (ardoise D-49), so the URL token and the IP allowlist are the only
 * guards it can ever have. The replacement is `sms:pull-mtarget-dlr`,
 * which inverts the flow. Both run during the overlap period documented
 * in TCK-294; `sms.mtarget.webhook_enabled=false` retires this one
 * without a deploy, and turns it back on just as fast if the pulling
 * proves to miss reports.
 *
 * Its status mapping is deliberately NOT shared with the pulling path:
 * the two streams are documented with different code sets (the pulling
 * queue reuses `Status=5` for mobile-originated messages, which the push
 * documentation does not list at all). Only the ticket→attempt matching
 * is shared, via {@see MtargetTicketMatcher} — that is the one thing the
 * two paths must agree on.
 */
class MtargetSmsStatusController extends Controller
{
    public function __invoke(Request $request, DeliveryAttemptUpdater $updater): JsonResponse
    {
        if (! config('sms.mtarget.webhook_enabled', true)) {
            abort(404);
        }
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

        $newStatus = match (true) {
            $statusCode === 3 => SmsResult::STATUS_DELIVERED,
            default => SmsResult::STATUS_FAILED,
        };
        $deliveredAt = $newStatus === SmsResult::STATUS_DELIVERED ? now() : null;

        // Mtarget returns ONE ticket for a batched send; our driver stores
        // `{ticket}|{E.164}` per recipient. Candidate order is shared with
        // the pulling path (TCK-294) so the two cannot drift.
        $updated = false;
        foreach (MtargetTicketMatcher::candidates($providerMessageId, $destination) as $candidate) {
            $updated = $updater->applyStatus(
                provider: 'mtarget',
                providerMessageId: $candidate,
                newStatus: $newStatus,
                failureReason: $newStatus === SmsResult::STATUS_FAILED ? $statusText : null,
                deliveredAt: $deliveredAt,
            );
            if ($updated) {
                break;
            }
        }
        if (! $updated) {
            abort(404);
        }

        // TCK-294 — the overlap period is only measurable if both paths
        // count what they move. The pulling command prints its counters;
        // this is the push side's equivalent. Comparing the two decides
        // when the webhook can be retired — without it, "the pulling
        // returns the same statuses" would be an opinion.
        Log::info('[sms.mtarget.webhook] delivery report applied', [
            'ticket' => $providerMessageId,
            'status' => $newStatus,
        ]);

        return new JsonResponse(['ok' => true]);
    }
}

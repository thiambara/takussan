<?php

namespace App\Services\Notifications\Sms;

use App\Models\NotificationDeliveryAttempt;
use Illuminate\Support\Facades\DB;

/**
 * TCK-102 / TCK-110 — Apply a DLR webhook update to one row of
 * {@see NotificationDeliveryAttempt}, looked up by the unique
 * `(provider, provider_message_id)` index. This replaces the legacy
 * JSON-column `LIKE '%…%'` scan, removing both the full-table-scan
 * cost and the substring-collision ambiguity (`mtg-77` vs `mtg-770`).
 */
class DeliveryAttemptUpdater
{
    /**
     * P36.02 (TCK-796) — la précédence des accusés SMS, poussés comme tirés : `failed` est le rang
     * le plus haut, puis `delivered`, puis `sent`. Un accusé de rang inférieur arrivé après (tardif,
     * renvoyé par le fournisseur ou rejoué par `WebhookReplayer`) est ignoré. Les trois routes
     * poussées (Orange, Mtarget, LAfricaMobile) l'appliquent comme le pulling Mtarget
     * (`DlrReportApplier`) : jusqu'à TCK-796, elles gardaient le dernier écrit, et un `sent` tardif
     * effaçait un `delivered` et son `delivered_at`.
     */
    public const SMS_STATUS_PRECEDENCE = [
        SmsResult::STATUS_SENT,
        SmsResult::STATUS_DELIVERED,
        SmsResult::STATUS_FAILED,
    ];

    /**
     * @param  list<string>|null  $statusPrecedence  Optional low→high status
     *                                               ordering. When given, an incoming status whose rank is lower than the
     *                                               attempt's current status is ignored (no regression). Used by WhatsApp,
     *                                               whose DLRs progress `sent → delivered` and can arrive out of order or
     *                                               be replayed by Meta, and by every SMS DLR path with
     *                                               {@see self::SMS_STATUS_PRECEDENCE}; payment callers omit it and keep
     *                                               last-write semantics.
     * @return bool true if a row was actually updated, false if the
     *              webhook payload didn't match any tracked attempt.
     */
    public function applyStatus(
        string $provider,
        string $providerMessageId,
        string $newStatus,
        ?int $hintNotificationId = null,
        ?string $failureReason = null,
        ?\DateTimeInterface $deliveredAt = null,
        ?array $statusPrecedence = null,
    ): bool {
        if ($providerMessageId === '') {
            return false;
        }

        return DB::transaction(function () use (
            $provider, $providerMessageId, $newStatus, $hintNotificationId, $failureReason, $deliveredAt, $statusPrecedence
        ): bool {
            $query = NotificationDeliveryAttempt::query()
                ->where('provider', $provider)
                ->where('provider_message_id', $providerMessageId);
            if ($hintNotificationId) {
                $query->where('app_notification_id', $hintNotificationId);
            }
            // Lock the matched attempt so a concurrent send/append on the
            // same notification can't clobber the status we're about to
            // write.
            $attempt = $query->lockForUpdate()->first();
            if (! $attempt) {
                return false;
            }
            if ($attempt->status === $newStatus) {
                return true;
            }
            // Monotonic guard: never let a lower-ranked status overwrite a
            // higher one (e.g. a late/replayed WhatsApp `sent` clobbering an
            // already-`delivered` attempt and wiping `delivered_at`).
            if ($statusPrecedence !== null) {
                $currentRank = array_search($attempt->status, $statusPrecedence, true);
                $newRank = array_search($newStatus, $statusPrecedence, true);
                if ($currentRank !== false && $newRank !== false && $newRank < $currentRank) {
                    return true;
                }
            }
            $attempt->forceFill([
                'status' => $newStatus,
                'failure_reason' => $failureReason,
                'delivered_at' => $deliveredAt,
            ])->save();

            return true;
        });
    }
}

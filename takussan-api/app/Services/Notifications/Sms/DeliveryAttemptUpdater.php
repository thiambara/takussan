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
    ): bool {
        if ($providerMessageId === '') {
            return false;
        }

        return DB::transaction(function () use (
            $provider, $providerMessageId, $newStatus, $hintNotificationId, $failureReason, $deliveredAt
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
            $attempt->forceFill([
                'status' => $newStatus,
                'failure_reason' => $failureReason,
                'delivered_at' => $deliveredAt,
            ])->save();

            return true;
        });
    }
}

<?php

namespace App\Services\Notifications\Sms;

use App\Models\AppNotification;
use Illuminate\Support\Facades\DB;

/**
 * TCK-102 — Idempotently update one entry of `delivery_attempts` JSON
 * on an AppNotification when a provider DLR webhook fires.
 *
 * Match key is `(provider, provider_message_id)`. If the matching
 * attempt already has the new status, no write happens. New entries
 * get appended with `attempt = (max existing) + 1` so support can
 * still trace the sequence.
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
        // LIKE filter narrows the candidate set on any DB (incl. SQLite).
        // We then scan attempts in PHP to find the exact (provider,
        // provider_message_id) match — this avoids relying on
        // whereJsonContains, whose semantics differ between drivers.
        // Wildcard chars (`%`, `_`, `\`) in the provider id must be
        // escaped so a provider can't smuggle them in to broaden the
        // match across notifications.
        $query = AppNotification::query()->whereNotNull('delivery_attempts');
        if ($hintNotificationId) {
            $query->where('id', $hintNotificationId);
        } else {
            $escaped = addcslashes($providerMessageId, '\\%_');
            $query->where('delivery_attempts', 'LIKE', '%'.$escaped.'%');
        }
        $candidateId = null;
        foreach ($query->get(['id', 'delivery_attempts']) as $candidate) {
            foreach ((array) $candidate->getAttribute('delivery_attempts') as $entry) {
                if (
                    ($entry['provider'] ?? null) === $provider
                    && ($entry['provider_message_id'] ?? null) === $providerMessageId
                ) {
                    $candidateId = $candidate->id;
                    break 2;
                }
            }
        }
        if (! $candidateId) {
            return false;
        }

        // Re-load under a row lock so concurrent DLRs / router writes
        // serialize on this notification and we don't lose attempts.
        return DB::transaction(function () use (
            $candidateId, $provider, $providerMessageId, $newStatus, $failureReason, $deliveredAt
        ): bool {
            $notification = AppNotification::query()->lockForUpdate()->find($candidateId);
            if (! $notification) {
                return false;
            }
            $attempts = (array) ($notification->getAttribute('delivery_attempts') ?? []);
            foreach ($attempts as $entry) {
                if (
                    ($entry['provider'] ?? null) === $provider
                    && ($entry['provider_message_id'] ?? null) === $providerMessageId
                    && ($entry['status'] ?? null) === $newStatus
                ) {
                    // Idempotent — already applied.
                    return true;
                }
            }

            $maxAttempt = 0;
            foreach ($attempts as $entry) {
                $maxAttempt = max($maxAttempt, (int) ($entry['attempt'] ?? 0));
            }
            $newEntry = [
                'attempt' => $maxAttempt + 1,
                'provider' => $provider,
                'provider_message_id' => $providerMessageId,
                'status' => $newStatus,
                'failure_reason' => $failureReason,
                'sent_at' => null,
            ];
            if ($deliveredAt) {
                $newEntry['delivered_at'] = $deliveredAt->format(DATE_ATOM);
            }
            $attempts[] = $newEntry;
            $notification->forceFill(['delivery_attempts' => $attempts])->save();

            return true;
        });
    }
}

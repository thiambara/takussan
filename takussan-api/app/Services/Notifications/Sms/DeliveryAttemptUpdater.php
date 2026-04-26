<?php

namespace App\Services\Notifications\Sms;

use App\Models\AppNotification;

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
        $query = AppNotification::query()->whereNotNull('delivery_attempts');
        if ($hintNotificationId) {
            $query->where('id', $hintNotificationId);
        } else {
            $query->where('delivery_attempts', 'LIKE', '%'.$providerMessageId.'%');
        }
        $notification = null;
        foreach ($query->get() as $candidate) {
            foreach ((array) $candidate->getAttribute('delivery_attempts') as $entry) {
                if (
                    ($entry['provider'] ?? null) === $provider
                    && ($entry['provider_message_id'] ?? null) === $providerMessageId
                ) {
                    $notification = $candidate;
                    break 2;
                }
            }
        }
        if (! $notification) {
            return false;
        }

        $attempts = (array) $notification->getAttribute('delivery_attempts');
        $matched = false;
        foreach ($attempts as &$entry) {
            if (
                ($entry['provider'] ?? null) === $provider
                && ($entry['provider_message_id'] ?? null) === $providerMessageId
                && ($entry['status'] ?? null) === $newStatus
            ) {
                // Idempotent — already applied.
                return true;
            }
        }
        unset($entry);

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
    }
}

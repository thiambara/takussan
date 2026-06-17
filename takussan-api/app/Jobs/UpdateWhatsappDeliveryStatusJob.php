<?php

namespace App\Jobs;

use App\Models\NotificationDeliveryAttempt;
use App\Services\Notifications\Sms\DeliveryAttemptUpdater;
use App\Services\Notifications\Whatsapp\WhatsappResult;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * TCK-283 — Apply one WhatsApp DLR status to the matching
 * {@see NotificationDeliveryAttempt} via the unique
 * `(provider, provider_message_id)` index. Dispatched async by the status
 * webhook so the 200 response is returned immediately; idempotent through
 * {@see DeliveryAttemptUpdater} (status compare).
 */
class UpdateWhatsappDeliveryStatusJob implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public readonly string $providerMessageId,
        public readonly string $metaStatus,
        public readonly ?string $failureReason = null,
        public readonly ?int $timestamp = null,
    ) {}

    public function handle(DeliveryAttemptUpdater $updater): void
    {
        $newStatus = match ($this->metaStatus) {
            'sent' => WhatsappResult::STATUS_SENT,
            // `read` implies delivery; we have no dedicated read state.
            'delivered', 'read' => WhatsappResult::STATUS_DELIVERED,
            'failed' => WhatsappResult::STATUS_FAILED,
            default => null,
        };
        if ($newStatus === null) {
            return;
        }

        $deliveredAt = $newStatus === WhatsappResult::STATUS_DELIVERED
            ? ($this->timestamp ? CarbonImmutable::createFromTimestamp($this->timestamp) : CarbonImmutable::now())
            : null;

        $updater->applyStatus(
            provider: 'whatsapp_cloud',
            providerMessageId: $this->providerMessageId,
            newStatus: $newStatus,
            failureReason: $newStatus === WhatsappResult::STATUS_FAILED ? $this->failureReason : null,
            deliveredAt: $deliveredAt,
            // WhatsApp DLRs progress sent → delivered and may arrive out of
            // order / replayed; never regress to an earlier status.
            statusPrecedence: [
                WhatsappResult::STATUS_SENT,
                WhatsappResult::STATUS_DELIVERED,
                WhatsappResult::STATUS_FAILED,
            ],
        );
    }
}

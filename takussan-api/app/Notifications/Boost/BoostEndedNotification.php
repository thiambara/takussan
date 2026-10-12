<?php

namespace App\Notifications\Boost;

use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\NotificationType;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/** TCK-633 lot F (ADR-0061 §8, §9) — une Vedette ou un Badge a pris fin (échéance ou modération). */
class BoostEndedNotification extends Notification
{
    use Queueable;

    public function __construct(public readonly int $propertyId, public readonly string $propertyTitle) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toAppNotification(object $notifiable): array
    {
        return [
            'type' => NotificationType::System,
            'title' => __('credits.boost.ended.title'),
            'body' => __('credits.boost.ended.body', ['property' => $this->propertyTitle]),
            'data' => $this->toArray($notifiable),
            'target' => NotificationTarget::of('property', $this->propertyId)->toArray(),
        ];
    }

    public function toArray(object $notifiable): array
    {
        return ['property_id' => $this->propertyId];
    }
}

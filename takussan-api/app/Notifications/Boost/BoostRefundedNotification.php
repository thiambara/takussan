<?php

namespace App\Notifications\Boost;

use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\NotificationType;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * TCK-633 lot F (ADR-0061 §4, §8, AC15) — Vedette interrompue (loué, vendu, supprimé, annulation),
 * jours pleins remboursés. `credits` est ce qui est RÉELLEMENT rendu ; `expired`, ce qui ne l'est
 * pas parce que le lot qui l'avait payé a déjà expiré — nommé seulement s'il y en a.
 */
class BoostRefundedNotification extends Notification
{
    use Queueable;

    public function __construct(
        public readonly int $propertyId,
        public readonly string $propertyTitle,
        public readonly int $credits,
        public readonly int $expired = 0,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toAppNotification(object $notifiable): array
    {
        return [
            'type' => NotificationType::System,
            'title' => __('credits.boost.refunded.title'),
            'body' => $this->expired > 0
                ? __('credits.boost.refunded.body_with_expired', ['property' => $this->propertyTitle, 'credits' => $this->credits, 'expired' => $this->expired])
                : __('credits.boost.refunded.body', ['property' => $this->propertyTitle, 'credits' => $this->credits]),
            'data' => $this->toArray($notifiable),
            'target' => NotificationTarget::of('property', $this->propertyId)->toArray(),
        ];
    }

    public function toArray(object $notifiable): array
    {
        return ['property_id' => $this->propertyId, 'credits' => $this->credits, 'expired' => $this->expired];
    }
}

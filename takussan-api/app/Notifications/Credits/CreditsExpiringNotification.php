<?php

namespace App\Notifications\Credits;

use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\NotificationType;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Carbon;

/** TCK-633 lot F (ADR-0061 §9) — préavis d'expiration, envoyé une fois par lot. */
class CreditsExpiringNotification extends Notification
{
    use Queueable;

    public function __construct(
        public readonly int $credits,
        public readonly string $expiresOn,
        public readonly string $agencyName,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toAppNotification(object $notifiable): array
    {
        return [
            'type' => NotificationType::System,
            'title' => __('credits.notifications.expiring.title'),
            'body' => __('credits.notifications.expiring.body', [
                'credits' => $this->credits,
                'agency' => $this->agencyName,
                'date' => Carbon::parse($this->expiresOn)->locale(app()->getLocale())->isoFormat('LL'),
            ]),
            'data' => $this->toArray($notifiable),
            'target' => NotificationTarget::fromArray(['kind' => 'credits'])?->toArray(),
        ];
    }

    public function toArray(object $notifiable): array
    {
        return ['credits' => $this->credits, 'expires_on' => $this->expiresOn];
    }
}

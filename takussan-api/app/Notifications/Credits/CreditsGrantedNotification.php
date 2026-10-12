<?php

namespace App\Notifications\Credits;

use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\NotificationType;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Carbon;

/** TCK-633 lot F (ADR-0061 §3, AC13) — des crédits arrivent sur l'espace (bienvenue, octroi, remboursement). */
class CreditsGrantedNotification extends Notification
{
    use Queueable;

    public function __construct(
        public readonly int $credits,
        public readonly ?string $expiresOn,
        public readonly string $agencyName,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toAppNotification(object $notifiable): array
    {
        $params = ['credits' => $this->credits, 'agency' => $this->agencyName];

        return [
            'type' => NotificationType::System,
            'title' => __('credits.notifications.granted.title'),
            'body' => $this->expiresOn === null
                ? __('credits.notifications.granted.body_no_expiry', $params)
                : __('credits.notifications.granted.body', $params + ['date' => Carbon::parse($this->expiresOn)->locale(app()->getLocale())->isoFormat('LL')]),
            'data' => $this->toArray($notifiable),
            // C11 : `credits` n'existe pas encore dans `NotificationTarget::PATHS` → `fromArray()` rend null
            // (pas de lien) ; une fois C11 appliquée, le lien mène à `/app/credits`. Aucun rouge dans les deux cas.
            'target' => NotificationTarget::fromArray(['kind' => 'credits'])?->toArray(),
        ];
    }

    public function toArray(object $notifiable): array
    {
        return ['credits' => $this->credits, 'expires_on' => $this->expiresOn];
    }
}

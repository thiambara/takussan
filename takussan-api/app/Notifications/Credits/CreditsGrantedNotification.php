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
        // TCK-2806 — l'agence du lot, que la cible porte : la page Crédits lit l'agence du profil actif.
        public readonly int $agencyId,
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
            // TCK-2806 — la page Crédits de l'agence du lot (section d'agence, TCK-1761) : un administrateur
            // de deux agences y arrive dans celle-ci, et non dans celle de son profil actif.
            'target' => NotificationTarget::of('credits')->forAgency($this->agencyId)->toArray(),
        ];
    }

    public function toArray(object $notifiable): array
    {
        return ['credits' => $this->credits, 'expires_on' => $this->expiresOn];
    }
}

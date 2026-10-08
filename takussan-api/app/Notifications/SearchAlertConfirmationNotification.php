<?php

namespace App\Notifications;

use App\Models\AlertSubscriber;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-599 (ADR-0050 §4) — l'UNIQUE message envoyé à un contact avant sa confirmation : un lien
 * porteur d'un jeton de 256 bits, dont seule l'empreinte est stockée. Le canal WhatsApp ne passe
 * pas par ici : son code est celui de `PhoneVerificationService` (TCK-589).
 */
class SearchAlertConfirmationNotification extends Notification
{
    use Queueable;

    /** Les langues de la surface publique (ADR-0026). */
    private const PUBLIC_LOCALES = ['fr', 'en', 'wo'];

    public function __construct(private readonly string $token) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return $notifiable instanceof AlertSubscriber && $notifiable->channel === AlertSubscriber::CHANNEL_EMAIL
            ? ['mail']
            : [];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $locale = in_array($notifiable->locale ?? null, self::PUBLIC_LOCALES, true) ? $notifiable->locale : 'fr';
        $url = rtrim((string) (config('app.frontend_url') ?: config('app.url')), '/')
            .'/'.$locale.'/search-alerts/confirm?token='.rawurlencode($this->token);

        return (new MailMessage)
            ->subject(__('saved_search_alerts.confirm.mail.subject'))
            ->greeting(__('saved_search_alerts.confirm.mail.greeting'))
            // verif-599 B1 — AUCUNE saisie du demandeur avant consentement : ce message part vers
            // une adresse que personne n'a encore confirmée, il ne doit rien porter qu'un tiers
            // ait choisi (un nom d'alerte rendait un lien Markdown arbitraire).
            ->line(__('saved_search_alerts.confirm.mail.intro'))
            ->action(__('saved_search_alerts.confirm.mail.action'), $url)
            ->line(__('saved_search_alerts.confirm.mail.expire', ['hours' => (int) config('search_alerts.confirmation_ttl_hours', 48)]))
            ->line(__('saved_search_alerts.confirm.mail.ignore'))
            ->salutation(__('notifications.salutation'));
    }
}

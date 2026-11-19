<?php

namespace App\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Services\Notifications\NotificationRenderer;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-2985 (ADR-0132 § 6) — le résumé du lundi par e-mail. Le canal `mail` SEUL : ni la cloche (le résumé n'entre
 * pas dans le fil des notifications), ni le SMS (jamais de repli). Le texte est celui du code
 * `owner.weekly_digest`, rendu dans la langue du destinataire.
 */
class OwnerWeeklyDigestNotification extends Notification
{
    /** @param  array<string, mixed>  $params  paramètres BRUTS de {@see NotificationCode::OwnerWeeklyDigest} */
    public function __construct(public readonly array $params) {}

    /**
     * Le courriel seul ; rien pour un compte sans adresse (P193.04, `AvisSansEmailTest`) : le résumé n'a pas d'autre
     * repli que l'e-mail — jamais le SMS (ADR-0132 § 6) —, et `ResumeDuLundi` ne l'envoie qu'à un compte qui en a une.
     *
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        return blank($notifiable->email ?? null) ? [] : ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $locale = method_exists($notifiable, 'preferredLocale') ? ($notifiable->preferredLocale() ?? (string) config('app.locale')) : (string) config('app.locale');

        $mail = (new MailMessage)->subject($this->render($notifiable, $locale, 'mail_subject'))->greeting(__('notifications.greeting', [], $locale));
        foreach (preg_split('/\R/', $this->render($notifiable, $locale, 'mail_body')) ?: [] as $line) {
            $mail->line($line);
        }

        return $mail->salutation(__('notifications.salutation', [], $locale));
    }

    /** Une surface (`mail_subject`, `mail_body`) du code `owner.weekly_digest`, dans la langue du destinataire : une clé, jamais de la prose. */
    private function render(object $notifiable, string $locale, string $surface): string
    {
        return app(NotificationRenderer::class)->render(NotificationCode::OwnerWeeklyDigest, $this->params, $locale, $notifiable->timezone ?? null, $surface, $notifiable->first_name ?? null);
    }
}

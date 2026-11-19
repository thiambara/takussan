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

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $locale = method_exists($notifiable, 'preferredLocale') ? ($notifiable->preferredLocale() ?? (string) config('app.locale')) : (string) config('app.locale');
        $renderer = app(NotificationRenderer::class);
        $render = fn (string $surface) => $renderer->render(NotificationCode::OwnerWeeklyDigest, $this->params, $locale, $notifiable->timezone ?? null, $surface, $notifiable->first_name ?? null);

        $mail = (new MailMessage)->subject($render('mail_subject'))->greeting(__('notifications.greeting', [], $locale));
        foreach (preg_split('/\R/', $render('mail_body')) ?: [] as $line) {
            $mail->line($line);
        }

        return $mail->salutation(__('notifications.salutation', [], $locale));
    }
}

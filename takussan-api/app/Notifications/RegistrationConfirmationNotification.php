<?php

namespace App\Notifications;

use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Notifications\Messages\MailMessage;

/**
 * Registration confirmation — sent on the `Registered` auth event.
 *
 * Extends Laravel's built-in VerifyEmail so the signed URL generation is
 * preserved, but overrides the mail content to use our localized Blade/lang
 * strings (FR/EN/WO supported via lang/<locale>/notifications.php).
 */
class RegistrationConfirmationNotification extends VerifyEmail
{
    /**
     * Build the mail message with localized strings.
     */
    protected function buildMailMessage($url): MailMessage
    {
        return (new MailMessage)
            ->subject(__('notifications.registration.subject'))
            ->greeting(__('notifications.registration.greeting'))
            ->line(__('notifications.registration.intro'))
            ->action(__('notifications.registration.action'), $url)
            ->line(__('notifications.registration.expire', [
                'count' => config('auth.verification.expire', 60),
            ]))
            ->line(__('notifications.registration.ignore'))
            ->salutation(__('notifications.salutation'));
    }
}

<?php

namespace App\Notifications;

use App\Providers\AppServiceProvider;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Notifications\Messages\MailMessage;

/**
 * Password reset notification with localized content.
 *
 * Wired via {@see AppServiceProvider::boot()} by replacing the
 * default createUrl used by Laravel's Password facade.
 */
class ResetPasswordNotification extends ResetPassword
{
    public function toMail($notifiable): MailMessage
    {
        $url = $this->resetUrl($notifiable);

        return (new MailMessage)
            ->subject(__('notifications.password_reset.subject'))
            ->greeting(__('notifications.password_reset.greeting'))
            ->line(__('notifications.password_reset.intro'))
            ->action(__('notifications.password_reset.action'), $url)
            ->line(__('notifications.password_reset.expire', [
                'count' => config('auth.passwords.'.config('auth.defaults.passwords').'.expire', 60),
            ]))
            ->line(__('notifications.password_reset.ignore'))
            ->salutation(__('notifications.salutation'));
    }

    protected function resetUrl($notifiable): string
    {
        if (static::$createUrlCallback) {
            return call_user_func(static::$createUrlCallback, $notifiable, $this->token);
        }

        return url(route('password.reset', [
            'token' => $this->token,
            'email' => $notifiable->getEmailForPasswordReset(),
        ], false));
    }
}

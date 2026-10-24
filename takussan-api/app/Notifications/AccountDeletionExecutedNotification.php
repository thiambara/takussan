<?php

namespace App\Notifications;

use App\Models\AccountDeletionRequest;
use App\Notifications\Concerns\RepliSmsSansEmail;
use App\Notifications\Concerns\SupportsSms;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-080 — final confirmation once anonymization has run. Sent **before**
 * the user row is scrambled (the service dispatches the notification then
 * mutates the row), so Laravel routes the message to the original email.
 */
class AccountDeletionExecutedNotification extends Notification implements SupportsSms
{
    use Queueable;
    use RepliSmsSansEmail;

    public function __construct(public readonly ?AccountDeletionRequest $request = null) {}

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject(__('notifications.account_deletion_executed.subject'))
            ->greeting(__('notifications.account_deletion_executed.greeting'))
            ->line(__('notifications.account_deletion_executed.intro'))
            ->line(__('notifications.account_deletion_executed.retention'))
            ->line(__('notifications.account_deletion_executed.contact'))
            ->salutation(__('notifications.salutation'));
    }

    /** P193.04 (TCK-2051) — un compte sans e-mail : SMS au numéro vérifié. */
    public function toSms(object $notifiable): string
    {
        return __('notifications.account_deletion_executed.sms', []);
    }
}

<?php

namespace App\Notifications;

use App\Models\AccountDeletionRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-080 — final confirmation once anonymization has run. Sent **before**
 * the user row is scrambled (the service dispatches the notification then
 * mutates the row), so Laravel routes the message to the original email.
 */
class AccountDeletionExecutedNotification extends Notification
{
    use Queueable;

    public function __construct(public readonly ?AccountDeletionRequest $request = null) {}

    /** @return array<int,string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

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
}

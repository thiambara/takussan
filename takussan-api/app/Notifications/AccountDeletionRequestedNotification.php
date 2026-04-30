<?php

namespace App\Notifications;

use App\Models\AccountDeletionRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-080 — confirms a user's deletion request, gives the effective date,
 * and points at the cancellation route ("changed your mind?").
 */
class AccountDeletionRequestedNotification extends Notification
{
    use Queueable;

    public function __construct(public readonly AccountDeletionRequest $request) {}

    /** @return array<int,string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $scheduledFor = $this->request->scheduled_for?->format('d/m/Y') ?? '';
        $cancelUrl = config('app.frontend_url', config('app.url')).'/app/profile?cancel-deletion=1';

        return (new MailMessage)
            ->subject(__('notifications.account_deletion_requested.subject'))
            ->greeting(__('notifications.account_deletion_requested.greeting'))
            ->line(__('notifications.account_deletion_requested.intro', ['date' => $scheduledFor]))
            ->line(__('notifications.account_deletion_requested.consequences'))
            ->action(__('notifications.account_deletion_requested.action'), $cancelUrl)
            ->line(__('notifications.account_deletion_requested.ignore'))
            ->salutation(__('notifications.salutation'));
    }
}

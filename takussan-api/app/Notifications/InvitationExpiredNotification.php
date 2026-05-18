<?php

namespace App\Notifications;

use App\Models\Invitation;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-249 — fired by the `invitations:expire` cron when an invitation
 * lapses without being accepted. Notifies the inviter so they can
 * resend / clean up the pending pipeline.
 */
class InvitationExpiredNotification extends Notification
{
    use Queueable;

    public function __construct(public readonly Invitation $invitation) {}

    /** @return array<int,string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $email = $this->invitation->email;

        return (new MailMessage)
            ->subject(__('notifications.invitation_expired.subject', ['email' => $email]))
            ->greeting(__('notifications.invitation_expired.greeting'))
            ->line(__('notifications.invitation_expired.intro', ['email' => $email]))
            ->line(__('notifications.invitation_expired.advice'))
            ->salutation(__('notifications.salutation'));
    }
}

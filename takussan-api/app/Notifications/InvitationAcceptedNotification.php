<?php

namespace App\Notifications;

use App\Models\Invitation;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-249 — fired when an invitation is accepted, addressed to the
 * inviter so they get visibility on their pending pipeline.
 */
class InvitationAcceptedNotification extends Notification
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
        $role = __('invitations.roles.'.$this->invitation->role);

        return (new MailMessage)
            ->subject(__('notifications.invitation_accepted.subject', ['email' => $email]))
            ->greeting(__('notifications.invitation_accepted.greeting'))
            ->line(__('notifications.invitation_accepted.intro', [
                'email' => $email,
                'role' => $role,
            ]))
            ->salutation(__('notifications.salutation'));
    }
}

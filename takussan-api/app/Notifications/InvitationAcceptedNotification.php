<?php

namespace App\Notifications;

use App\Models\Invitation;
use App\Notifications\Concerns\RetriesWithBackoff;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-249 — fired when an invitation is accepted, addressed to the
 * inviter so they get visibility on their pending pipeline.
 *
 * TCK-1335 — en file : son échec ne remonte plus à l'acceptation. Elle attend entre deux
 * essais et journalise son échec (`RetriesWithBackoff`, TCK-1352).
 */
class InvitationAcceptedNotification extends Notification implements ShouldQueue
{
    use Queueable;
    use RetriesWithBackoff;

    public function __construct(public readonly Invitation $invitation) {}

    /** @return array<int,string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $email = $this->invitation->inviteeContact();
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

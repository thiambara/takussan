<?php

namespace App\Notifications;

use App\Models\Enums\NotificationType;
use App\Models\Invitation;
use App\Models\User;
use App\Notifications\Channels\AppDatabaseChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-264 — Broadcast to all *other* super-admins when one of them
 * coopts a new super-admin. Transparency by default: every existing
 * super-admin sees who invited whom in their notification feed and
 * inbox, no opt-in required.
 */
class SuperAdminInvitedBroadcast extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public readonly Invitation $invitation,
        public readonly User $inviter,
    ) {}

    /** @return array<int,string> */
    public function via(object $notifiable): array
    {
        return ['database', 'mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $targetEmail = $this->invitation->email;
        $inviterName = trim(($this->inviter->first_name ?? '').' '.($this->inviter->last_name ?? ''));
        if ($inviterName === '') {
            $inviterName = (string) $this->inviter->email;
        }

        return (new MailMessage)
            ->subject(__('super_admins.cooptation.notifications.invited.subject', [
                'email' => $targetEmail,
            ]))
            ->greeting(__('notifications.salutation'))
            ->line(__('super_admins.cooptation.notifications.invited.body', [
                'inviter' => $inviterName,
                'email' => $targetEmail,
            ]))
            ->salutation(__('notifications.salutation'));
    }

    /**
     * Le feed in-app (`app_notifications`) exige un `type` et un `title` ; le
     * `toArray()` de cette classe n'en porte pas. On les déclare donc ici plutôt que
     * de les laisser deviner — {@see AppDatabaseChannel}.
     *
     * @return array{type: NotificationType, title: string, data: array<string,mixed>}
     */
    public function toAppNotification(object $notifiable): array
    {
        return [
            'type' => NotificationType::System,
            'title' => __('super_admins.cooptation.notifications.invited.subject', [
                'email' => $this->invitation->email,
            ]),
            'data' => $this->toArray($notifiable),
        ];
    }

    /** @return array<string,mixed> */
    public function toArray(object $notifiable): array
    {
        return [
            'event' => 'super_admin_invited',
            'invitation_id' => $this->invitation->id,
            'target_email' => $this->invitation->email,
            'inviter_id' => $this->inviter->id,
            'inviter_email' => $this->inviter->email,
        ];
    }
}

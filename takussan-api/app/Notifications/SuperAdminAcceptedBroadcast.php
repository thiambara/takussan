<?php

namespace App\Notifications;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-264 — Broadcast to *all* super-admins when a freshly-coopted
 * peer finishes 2FA enrollment and the spatie role is attached.
 *
 * Closes the loop opened by {@see SuperAdminInvitedBroadcast}: peers
 * see when an invitation has actually graduated into a fully-formed
 * super-admin account.
 */
class SuperAdminAcceptedBroadcast extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public readonly User $newSuperAdmin) {}

    /** @return array<int,string> */
    public function via(object $notifiable): array
    {
        return ['database', 'mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $name = trim(($this->newSuperAdmin->first_name ?? '').' '.($this->newSuperAdmin->last_name ?? ''));
        if ($name === '') {
            $name = (string) $this->newSuperAdmin->email;
        }

        return (new MailMessage)
            ->subject(__('super_admins.cooptation.notifications.accepted.subject', [
                'name' => $name,
            ]))
            ->greeting(__('notifications.salutation'))
            ->line(__('super_admins.cooptation.notifications.accepted.body', [
                'name' => $name,
                'email' => $this->newSuperAdmin->email,
            ]))
            ->salutation(__('notifications.salutation'));
    }

    /** @return array<string,mixed> */
    public function toArray(object $notifiable): array
    {
        return [
            'event' => 'super_admin_accepted',
            'user_id' => $this->newSuperAdmin->id,
            'email' => $this->newSuperAdmin->email,
        ];
    }
}

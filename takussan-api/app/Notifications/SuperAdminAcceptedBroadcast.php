<?php

namespace App\Notifications;

use App\Models\Enums\NotificationType;
use App\Models\User;
use App\Notifications\Channels\AppDatabaseChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-264 — Broadcast to *all* super-admins when a freshly-coopted
 * peer finishes 2FA enrollment and the `PlatformProfile` (level
 * `super_admin`) is granted. TCK-278 — this used to say « the spatie role
 * is attached »; `spatie/laravel-permission` is uninstalled (ADR-0002).
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
        return (new MailMessage)
            ->subject(__('super_admins.cooptation.notifications.accepted.subject', [
                'name' => $this->nomAffiche(),
            ]))
            ->greeting(__('notifications.salutation'))
            ->line(__('super_admins.cooptation.notifications.accepted.body', [
                'name' => $this->nomAffiche(),
                'email' => $this->newSuperAdmin->email,
            ]))
            ->salutation(__('notifications.salutation'));
    }

    /** Nom complet du nouveau super-admin, ou son e-mail à défaut. */
    private function nomAffiche(): string
    {
        $name = trim(($this->newSuperAdmin->first_name ?? '').' '.($this->newSuperAdmin->last_name ?? ''));

        return $name !== '' ? $name : (string) $this->newSuperAdmin->email;
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
            'title' => __('super_admins.cooptation.notifications.accepted.subject', [
                'name' => $this->nomAffiche(),
            ]),
            'data' => $this->toArray($notifiable),
        ];
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

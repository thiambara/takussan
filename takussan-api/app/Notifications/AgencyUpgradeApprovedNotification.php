<?php

namespace App\Notifications;

use App\Models\AgencyUpgradeRequest;
use App\Models\Enums\NotificationType;
use App\Notifications\Channels\AppDatabaseChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-268 — Notifies the original submitter that their agency upgrade
 * request has been approved by a super-admin.
 *
 * The actual `Agency.kind` flip + tenant/agency post-flip notifications
 * are owned by TCK-269; this notification only addresses the requester
 * and tells them the decision is in.
 */
class AgencyUpgradeApprovedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public readonly AgencyUpgradeRequest $upgradeRequest) {}

    /** @return array<int,string> */
    public function via(object $notifiable): array
    {
        return ['database', 'mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $appUrl = $this->dashboardUrl();

        return (new MailMessage)
            ->subject(__('agency_upgrade.notifications.approved.subject'))
            ->line(__('agency_upgrade.notifications.approved.body'))
            ->action(__('agency_upgrade.notifications.approved.action'), $appUrl);
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
            'title' => __('agency_upgrade.notifications.approved.subject'),
            'data' => $this->toArray($notifiable),
        ];
    }

    /** @return array<string,mixed> */
    public function toArray(object $notifiable): array
    {
        return [
            'kind' => 'agency_upgrade_request_approved',
            'agency_id' => $this->upgradeRequest->agency_id,
            'request_id' => $this->upgradeRequest->id,
            'reviewed_at' => $this->upgradeRequest->reviewed_at?->toIso8601String(),
        ];
    }

    protected function dashboardUrl(): string
    {
        $frontend = rtrim((string) (config('app.frontend_url') ?: config('app.url')), '/');

        return $frontend.'/app';
    }
}

<?php

namespace App\Notifications;

use App\Models\AgencyUpgradeRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-268 — Notifies the original submitter that their agency upgrade
 * request has been rejected, including the super-admin's motivation.
 *
 * The submitter can issue a fresh request from the same agency form
 * (TCK-267) once they address the motif — no automatic re-open.
 */
class AgencyUpgradeRejectedNotification extends Notification implements ShouldQueue
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
        $resubmitUrl = $this->resubmitUrl();
        $comment = $this->upgradeRequest->review_comment ?? '';

        return (new MailMessage)
            ->subject(__('agency_upgrade.notifications.rejected.subject'))
            ->line(__('agency_upgrade.notifications.rejected.body', ['comment' => $comment]))
            ->action(__('agency_upgrade.notifications.rejected.action'), $resubmitUrl);
    }

    /** @return array<string,mixed> */
    public function toDatabase(object $notifiable): array
    {
        return $this->toArray($notifiable);
    }

    /** @return array<string,mixed> */
    public function toArray(object $notifiable): array
    {
        return [
            'kind' => 'agency_upgrade_request_rejected',
            'agency_id' => $this->upgradeRequest->agency_id,
            'request_id' => $this->upgradeRequest->id,
            'review_comment' => $this->upgradeRequest->review_comment,
            'reviewed_at' => $this->upgradeRequest->reviewed_at?->toIso8601String(),
        ];
    }

    protected function resubmitUrl(): string
    {
        $frontend = rtrim((string) (config('app.frontend_url') ?: config('app.url')), '/');

        return $frontend.'/app/settings/agency/upgrade';
    }
}

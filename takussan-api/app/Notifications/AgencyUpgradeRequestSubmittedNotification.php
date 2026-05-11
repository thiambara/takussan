<?php

namespace App\Notifications;

use App\Models\AgencyUpgradeRequest;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-267 — fan-out fired when an `agency_admin` of an `individual` agency
 * submits a request to upgrade their agency to `standard`.
 *
 * Recipients: every super-admin (`User::role('super_admin')`). The list is
 * resolved by the calling service so the notification is dumb on purpose
 * (TCK-268 review console may add complementary notifications later).
 */
class AgencyUpgradeRequestSubmittedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public readonly AgencyUpgradeRequest $upgradeRequest,
        public readonly User $submitter,
    ) {}

    /** @return array<int,string> */
    public function via(object $notifiable): array
    {
        return ['database', 'mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $agency = $this->upgradeRequest->agency;
        $submitterName = trim(($this->submitter->first_name ?? '').' '.($this->submitter->last_name ?? ''));
        if ($submitterName === '') {
            $submitterName = (string) $this->submitter->email;
        }

        $reviewUrl = $this->reviewUrl();

        return (new MailMessage)
            ->subject(__('agency_upgrade.notifications.submitted.subject', [
                'agency' => $agency?->name ?? '#'.$this->upgradeRequest->agency_id,
            ]))
            ->line(__('agency_upgrade.notifications.submitted.body', [
                'submitter' => $submitterName,
                'agency' => $agency?->name ?? '#'.$this->upgradeRequest->agency_id,
            ]))
            ->action(__('agency_upgrade.notifications.submitted.action'), $reviewUrl);
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
            'kind' => 'agency_upgrade_request_submitted',
            'agency_id' => $this->upgradeRequest->agency_id,
            'request_id' => $this->upgradeRequest->id,
            'submitted_by_email' => $this->submitter->email,
        ];
    }

    /**
     * Best-effort URL pointing at the (TCK-268) super-admin review page.
     * The route does not exist yet at the time of writing — the link still
     * resolves to a meaningful path so super-admins can navigate to the
     * console once it ships.
     */
    protected function reviewUrl(): string
    {
        $frontend = rtrim((string) (config('app.frontend_url') ?: config('app.url')), '/');

        return $frontend.'/super-admin/agency-upgrade-requests/'.$this->upgradeRequest->id;
    }
}

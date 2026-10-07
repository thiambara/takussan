<?php

namespace App\Notifications;

use App\Models\MaintenanceRequest;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class UrgentMaintenanceCreatedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public const EVENT_TYPE = 'maintenance_status_changed';

    public function __construct(
        public MaintenanceRequest $maintenanceRequest,
        public bool $isEscalation = false,
    ) {
        $this->onQueue('notifications-urgent');
    }

    public function via(object $notifiable): array
    {
        $resolver = app(PreferenceResolver::class);

        // In-app is mandatory for urgent — bypass per-user prefs (CHANNEL_INAPP
        // is locked-on in PreferenceResolver, but we hardcode `database` to be
        // explicit about the contract for an urgent event).
        $channels = ['database'];

        if ($resolver->shouldSend($notifiable, self::EVENT_TYPE, PreferenceResolver::CHANNEL_EMAIL)) {
            $channels[] = 'mail';
        }
        if ($resolver->shouldSend($notifiable, self::EVENT_TYPE, PreferenceResolver::CHANNEL_PUSH)) {
            $channels[] = 'broadcast';
        }

        return $channels;
    }

    public function toMail(object $notifiable): MailMessage
    {
        $title = $this->maintenanceRequest->title ?? '#'.$this->maintenanceRequest->id;

        $mail = (new MailMessage)
            ->subject(__($this->isEscalation
                ? 'notifications.urgent_maintenance.subject_escalation'
                : 'notifications.urgent_maintenance.subject', ['title' => $title]))
            ->greeting(__('notifications.urgent_maintenance.greeting'));

        if ($this->isEscalation) {
            $mail->line(__('notifications.urgent_maintenance.intro_escalation', [
                'id' => $this->maintenanceRequest->id,
                'title' => $title,
            ]));
        } else {
            $mail->line(__('notifications.urgent_maintenance.intro'))
                ->line(__('notifications.urgent_maintenance.job', ['title' => $title]));
        }

        return $mail
            ->line(__('notifications.urgent_maintenance.cta'))
            ->salutation(__('notifications.salutation'));
    }

    public function toArray(object $notifiable): array
    {
        return [
            'maintenance_request_id' => $this->maintenanceRequest->id,
            'title' => __($this->isEscalation
                ? 'notifications.urgent_maintenance.title_escalation'
                : 'notifications.urgent_maintenance.title', [
                    'title' => $this->maintenanceRequest->title ?? '#'.$this->maintenanceRequest->id,
                ]),
            'priority' => 'urgent',
            'escalation' => $this->isEscalation,
        ];
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return new BroadcastMessage($this->toArray($notifiable));
    }

    public function broadcastType(): string
    {
        return $this->isEscalation ? 'maintenance.urgent_escalated' : 'maintenance.urgent_created';
    }
}

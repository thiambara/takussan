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
        $subjectPrefix = $this->isEscalation ? 'ESCALADE URGENTE' : 'URGENT';

        $mail = (new MailMessage)
            ->subject("{$subjectPrefix}: ".$title)
            ->greeting('Bonjour,');

        if ($this->isEscalation) {
            $mail->line("La demande de maintenance #{$this->maintenanceRequest->id} ({$title}) est URGENTE et n'a pas été traitée depuis plus de 30 minutes.");
        } else {
            $mail->line('Une demande de maintenance URGENTE a été soumise pour le bien.')
                ->line("Intervention: {$title}");
        }

        return $mail
            ->line('Veuillez prendre en charge cette demande immédiatement.')
            ->salutation(__('notifications.salutation'));
    }

    public function toArray(object $notifiable): array
    {
        $prefix = $this->isEscalation ? 'Escalade urgente' : 'Urgent';

        return [
            'maintenance_request_id' => $this->maintenanceRequest->id,
            'title' => "{$prefix}: ".($this->maintenanceRequest->title ?? '#'.$this->maintenanceRequest->id),
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

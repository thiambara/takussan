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

    public const EVENT_TYPE = 'maintenance_status_changed'; // Using an existing preference type or we can create a new one, but for now we'll stick to a generic one or 'maintenance_status_changed'. Since it's an urgent notification, it might bypass some preferences. Wait, the spec says "bypass" in TCK-070. Let's just use 'maintenance_status_changed' but bypass if needed. The instruction says "si configuré" for push/email, so we still check preferences.

    public function __construct(public MaintenanceRequest $maintenanceRequest)
    {
        $this->onQueue('notifications-urgent');
    }

    public function via(object $notifiable): array
    {
        $resolver = app(PreferenceResolver::class);
        $channels = [];

        // Critical notifications often bypass user preferences, but the ticket says "(si configuré) pour email + push"
        // so we check preferences, but maybe force in-app. The spec says "envoie une AppNotification + email + push (si configuré)".
        // So in-app is mandatory.
        $channels[] = 'database';

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

        return (new MailMessage)
            ->subject('URGENT: Nouvelle demande de maintenance - '.$title)
            ->greeting('Bonjour,')
            ->line('Une demande de maintenance URGENTE a été soumise pour le bien.')
            ->line("Intervention: {$title}")
            ->line('Veuillez prendre en charge cette demande immédiatement.')
            ->salutation(__('notifications.salutation'));
    }

    public function toArray(object $notifiable): array
    {
        return [
            'maintenance_request_id' => $this->maintenanceRequest->id,
            'title' => 'Urgent: '.($this->maintenanceRequest->title ?? '#'.$this->maintenanceRequest->id),
            'priority' => 'urgent',
        ];
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return new BroadcastMessage($this->toArray($notifiable));
    }

    public function broadcastType(): string
    {
        return 'maintenance.urgent_created';
    }
}

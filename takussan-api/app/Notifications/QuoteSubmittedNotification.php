<?php

namespace App\Notifications;

use App\Models\MaintenanceRequest;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class QuoteSubmittedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public const EVENT_TYPE = 'maintenance_status_changed';

    public function __construct(public MaintenanceRequest $maintenanceRequest) {}

    public function via(object $notifiable): array
    {
        $resolver = app(PreferenceResolver::class);
        $channels = [];

        if ($resolver->shouldSend($notifiable, self::EVENT_TYPE, PreferenceResolver::CHANNEL_INAPP)) {
            $channels[] = 'database';
        }
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
            ->subject('Devis soumis pour: ' . $title)
            ->greeting('Bonjour,')
            ->line("Un devis a été soumis pour l'intervention: {$title}.")
            ->line("Montant du devis: {$this->maintenanceRequest->quote_amount} {$this->maintenanceRequest->quote_currency}")
            ->line("Veuillez examiner le devis et l'approuver ou le rejeter.")
            ->salutation(__('notifications.salutation'));
    }

    public function toArray(object $notifiable): array
    {
        return [
            'maintenance_request_id' => $this->maintenanceRequest->id,
            'title' => 'Devis soumis pour: ' . ($this->maintenanceRequest->title ?? '#'.$this->maintenanceRequest->id),
        ];
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return new BroadcastMessage($this->toArray($notifiable));
    }

    public function broadcastType(): string
    {
        return 'maintenance.quote_submitted';
    }
}

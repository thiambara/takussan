<?php

namespace App\Notifications;

use App\Models\Property;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class PropertyRejectedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public const EVENT_TYPE = 'property_moderation';

    public function __construct(
        public Property $property,
        public string $rejectionReason,
    ) {}

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
        return (new MailMessage)
            ->subject('Votre bien a été refusé : '.$this->property->title)
            ->greeting('Bonjour,')
            ->line('Votre bien "'.($this->property->title).'" a été refusé pour la raison suivante :')
            ->line($this->rejectionReason)
            ->line('Vous pouvez corriger votre annonce et la resoumettre depuis votre espace agent.')
            ->salutation(__('notifications.salutation'));
    }

    public function toArray(object $notifiable): array
    {
        return [
            'property_id' => $this->property->id,
            'property_title' => $this->property->title,
            'rejection_reason' => $this->rejectionReason,
            'title' => 'Bien refusé : '.$this->property->title,
        ];
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return new BroadcastMessage($this->toArray($notifiable));
    }

    public function broadcastType(): string
    {
        return 'property.rejected';
    }
}

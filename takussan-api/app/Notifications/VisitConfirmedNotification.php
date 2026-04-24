<?php

namespace App\Notifications;

use App\Models\PropertyVisit;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-075 — Delivered to the visiting user once the agent/owner has
 * confirmed the visit request.
 */
class VisitConfirmedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public const EVENT_TYPE = 'visit_reminder';

    public function __construct(public PropertyVisit $visit) {}

    /**
     * @return list<string>
     */
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
        $title = $this->visit->property?->title ?? '#'.$this->visit->id;

        return (new MailMessage)
            ->subject(__('notifications.visit_confirmed.subject', ['property' => $title]))
            ->greeting(__('notifications.visit_confirmed.greeting'))
            ->line(__('notifications.visit_confirmed.intro', ['property' => $title]))
            ->line(__('notifications.visit_confirmed.schedule', [
                'datetime' => optional($this->visit->scheduled_at)->format('Y-m-d H:i') ?? '—',
            ]))
            ->salutation(__('notifications.salutation'));
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'visit_id' => $this->visit->id,
            'property_id' => $this->visit->property_id,
            'property_title' => $this->visit->property?->title,
            'scheduled_at' => optional($this->visit->scheduled_at)->toIso8601String(),
            'type' => $this->visit->type?->value,
            'title' => __('notifications.visit_confirmed.subject', [
                'property' => $this->visit->property?->title ?? '#'.$this->visit->id,
            ]),
        ];
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return new BroadcastMessage($this->toArray($notifiable));
    }

    public function broadcastType(): string
    {
        return 'visit.confirmed';
    }
}

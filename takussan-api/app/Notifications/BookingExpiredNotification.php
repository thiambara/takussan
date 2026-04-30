<?php

namespace App\Notifications;

use App\Models\Booking;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Fired when a booking request expires automatically or manually.
 * For tenants: in-app + email channels.
 * For agents: in-app only.
 */
class BookingExpiredNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public Booking $booking,
        public string $recipientType = 'tenant' // 'tenant' or 'agent'
    ) {}

    public const EVENT_TYPE_TENANT = 'booking_expired';

    public const EVENT_TYPE_AGENT = 'booking_expired_agent';

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        $resolver = app(PreferenceResolver::class);
        $channels = [];

        $eventType = $this->recipientType === 'agent'
            ? self::EVENT_TYPE_AGENT
            : self::EVENT_TYPE_TENANT;

        // Always add database (in-app) for both tenant and agent
        if ($resolver->shouldSend($notifiable, $eventType, PreferenceResolver::CHANNEL_INAPP)) {
            $channels[] = 'database';
        }

        // Email only for tenants, not agents
        if ($this->recipientType === 'tenant') {
            if ($resolver->shouldSend($notifiable, $eventType, PreferenceResolver::CHANNEL_EMAIL)) {
                $channels[] = 'mail';
            }
            if ($resolver->shouldSend($notifiable, $eventType, PreferenceResolver::CHANNEL_PUSH)) {
                $channels[] = 'broadcast';
            }
        }

        return $channels;
    }

    public function toMail(object $notifiable): MailMessage
    {
        $reference = $this->booking->reference_number ?? (string) $this->booking->id;
        $propertyTitle = $this->booking->property?->title ?? __('notifications.booking_expired.unknown_property');

        return (new MailMessage)
            ->subject(__('notifications.booking_expired.subject', ['reference' => $reference]))
            ->greeting(__('notifications.booking_expired.greeting'))
            ->line(__('notifications.booking_expired.intro', [
                'reference' => $reference,
                'property' => $propertyTitle,
            ]))
            ->line(__('notifications.booking_expired.expired_reason'))
            ->line(__('notifications.booking_expired.next_steps'))
            ->salutation(__('notifications.salutation'));
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(object $notifiable): array
    {
        $reference = $this->booking->reference_number ?? (string) $this->booking->id;
        $propertyTitle = $this->booking->property?->title ?? __('notifications.booking_expired.unknown_property');

        return [
            'booking_id' => $this->booking->id,
            'reference' => $this->booking->reference_number,
            'property_title' => $propertyTitle,
            'expired_at' => $this->booking->expired_at?->toIso8601String(),
            'expiry_reason' => $this->booking->expiry_reason,
            'recipient_type' => $this->recipientType,
            'title' => __('notifications.booking_expired.subject', ['reference' => $reference]),
            'message' => __('notifications.booking_expired.intro', [
                'reference' => $reference,
                'property' => $propertyTitle,
            ]),
        ];
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return new BroadcastMessage($this->toArray($notifiable));
    }

    public function broadcastType(): string
    {
        return $this->recipientType === 'agent'
            ? 'booking.expired.agent'
            : 'booking.expired';
    }
}

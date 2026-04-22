<?php

namespace App\Notifications;

use App\Models\Booking;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Fired when a booking is created/confirmed. Delivered to the booking's
 * customer through mail + broadcast + database (in-app feed) channels,
 * respecting the recipient's per-channel preferences.
 */
class NewBookingNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public Booking $booking) {}

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        $channels = ['database'];

        if ($notifiable->notifications_email_enabled ?? true) {
            $channels[] = 'mail';
        }

        if ($notifiable->notifications_push_enabled ?? true) {
            $channels[] = 'broadcast';
        }

        return $channels;
    }

    public function toMail(object $notifiable): MailMessage
    {
        $reference = $this->booking->reference_number ?? (string) $this->booking->id;

        return (new MailMessage)
            ->subject(__('notifications.new_booking.subject', ['reference' => $reference]))
            ->greeting(__('notifications.new_booking.greeting'))
            ->line(__('notifications.new_booking.intro', ['reference' => $reference]))
            ->line(__('notifications.new_booking.details', [
                'start' => optional($this->booking->start_date)->format('Y-m-d') ?? '—',
                'end' => optional($this->booking->end_date)->format('Y-m-d') ?? '—',
            ]))
            ->salutation(__('notifications.salutation'));
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'booking_id' => $this->booking->id,
            'reference' => $this->booking->reference_number,
            'start_date' => optional($this->booking->start_date)->toIso8601String(),
            'end_date' => optional($this->booking->end_date)->toIso8601String(),
            'title' => __('notifications.new_booking.subject', [
                'reference' => $this->booking->reference_number ?? (string) $this->booking->id,
            ]),
        ];
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return new BroadcastMessage($this->toArray($notifiable));
    }

    public function broadcastType(): string
    {
        return 'booking.created';
    }
}

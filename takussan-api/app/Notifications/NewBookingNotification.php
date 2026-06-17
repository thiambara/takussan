<?php

namespace App\Notifications;

use App\Models\Booking;
use App\Models\User;
use App\Notifications\Concerns\SupportsSms;
use App\Notifications\Concerns\SupportsWhatsapp;
use App\Services\Admin\NotificationTemplateService;
use App\Services\Notifications\PreferenceResolver;
use App\Services\Notifications\Whatsapp\WhatsappTemplateRef;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Fired when a booking is created/confirmed. Delivered to the booking's
 * customer through mail + broadcast + database (in-app feed) channels,
 * respecting the recipient's per-channel preferences.
 *
 * TCK-282 — Pilot for the WhatsApp-first / SMS-fallback mobile channel:
 * exactly one mobile channel is added (WhatsApp if eligible, else SMS) via
 * {@see PreferenceResolver::resolveMobileChannel()}.
 */
class NewBookingNotification extends Notification implements ShouldQueue, SupportsSms, SupportsWhatsapp
{
    use Queueable;

    public function __construct(public Booking $booking) {}

    public const EVENT_TYPE = 'booking_request';

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        $resolver = app(PreferenceResolver::class);
        $channels = [];

        // `database` maps to the `inapp` channel in our preference model.
        if ($resolver->shouldSend($notifiable, self::EVENT_TYPE, PreferenceResolver::CHANNEL_INAPP)) {
            $channels[] = 'database';
        }
        if ($resolver->shouldSend($notifiable, self::EVENT_TYPE, PreferenceResolver::CHANNEL_EMAIL)) {
            $channels[] = 'mail';
        }
        if ($resolver->shouldSend($notifiable, self::EVENT_TYPE, PreferenceResolver::CHANNEL_PUSH)) {
            $channels[] = 'broadcast';
        }
        // Mutually-exclusive mobile channel (AC5): `whatsapp` or `sms`,
        // never both. Only Users carry preferences + a verified phone.
        if ($notifiable instanceof User) {
            $mobile = $resolver->resolveMobileChannel($notifiable, self::EVENT_TYPE);
            if ($mobile !== null) {
                $channels[] = $mobile;
            }
        }

        return $channels;
    }

    public function whatsappEventType(): string
    {
        return self::EVENT_TYPE;
    }

    public function smsEventType(): string
    {
        return self::EVENT_TYPE;
    }

    private function mobileBody(object $notifiable): string
    {
        return __('notifications.new_booking.sms', [
            'reference' => $this->booking->reference_number ?? (string) $this->booking->id,
            'start' => optional($this->booking->start_date)->format('Y-m-d') ?? '—',
            'end' => optional($this->booking->end_date)->format('Y-m-d') ?? '—',
        ]);
    }

    public function toSms(object $notifiable): string
    {
        return $this->mobileBody($notifiable);
    }

    public function shouldSendSms(): bool
    {
        return true;
    }

    public function isCriticalSms(): bool
    {
        return false;
    }

    public function toWhatsapp(object $notifiable): string
    {
        return $this->mobileBody($notifiable);
    }

    /**
     * No approved Meta template wired for this event yet — the registry
     * lands in TCK-283. Until then, an out-of-window send falls back to SMS.
     */
    public function whatsappTemplate(object $notifiable): ?WhatsappTemplateRef
    {
        return null;
    }

    public function shouldSendWhatsapp(): bool
    {
        return true;
    }

    public function isCriticalWhatsapp(): bool
    {
        return false;
    }

    public function toMail(object $notifiable): MailMessage
    {
        $reference = $this->booking->reference_number ?? (string) $this->booking->id;
        $rendered = app(NotificationTemplateService::class)->renderActive(
            'booking_confirmed',
            'email',
            app()->getLocale(),
            [
                'booking' => [
                    'code' => $reference,
                    'start_date' => optional($this->booking->start_date)->format('Y-m-d') ?? '—',
                    'end_date' => optional($this->booking->end_date)->format('Y-m-d') ?? '—',
                ],
                'user' => ['first_name' => $notifiable->first_name ?? ''],
                'property' => ['title' => $this->booking->property?->title ?? ''],
            ],
            [
                'subject' => __('notifications.new_booking.subject', ['reference' => $reference]),
                'body' => __('notifications.new_booking.intro', ['reference' => $reference])."\n".__('notifications.new_booking.details', [
                    'start' => optional($this->booking->start_date)->format('Y-m-d') ?? '—',
                    'end' => optional($this->booking->end_date)->format('Y-m-d') ?? '—',
                ]),
            ],
        );

        return (new MailMessage)
            ->subject($rendered['subject'])
            ->greeting(__('notifications.new_booking.greeting'))
            ->line($rendered['body'])
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

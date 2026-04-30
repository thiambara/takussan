<?php

namespace App\Notifications;

use App\Models\Lease;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-091 — Tenant-facing notification on annual rent review. Channel
 * selection is filtered through {@see PreferenceResolver} against the
 * `lease_rent_reviewed` event so users can opt-out of email/push without
 * losing the in-app trail (inapp is locked on globally).
 */
class LeaseRentReviewedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public const EVENT_TYPE = 'lease_rent_reviewed';

    public function __construct(
        public Lease $lease,
        public float $oldRent,
        public float $newRent,
        public string $reason,
        public string $effectiveDate,
    ) {}

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
        $reference = $this->lease->reference_number ?? '#'.$this->lease->id;
        $currency = $this->lease->currency?->value ?? 'XOF';

        return (new MailMessage)
            ->subject(__('notifications.lease_rent_reviewed.subject', ['reference' => $reference]))
            ->greeting(__('notifications.lease_rent_reviewed.greeting'))
            ->line(__('notifications.lease_rent_reviewed.intro', [
                'reference' => $reference,
                'old' => number_format($this->oldRent, 0, '.', ' '),
                'new' => number_format($this->newRent, 0, '.', ' '),
                'currency' => $currency,
            ]))
            ->line(__('notifications.lease_rent_reviewed.effective', [
                'date' => $this->effectiveDate,
            ]))
            ->line(__('notifications.lease_rent_reviewed.reason', [
                'reason' => $this->reason,
            ]))
            ->salutation(__('notifications.salutation'));
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'lease_id' => $this->lease->id,
            'reference_number' => $this->lease->reference_number,
            'old_rent' => $this->oldRent,
            'new_rent' => $this->newRent,
            'currency' => $this->lease->currency?->value ?? 'XOF',
            'reason' => $this->reason,
            'effective_date' => $this->effectiveDate,
            'title' => __('notifications.lease_rent_reviewed.subject', [
                'reference' => $this->lease->reference_number ?? '#'.$this->lease->id,
            ]),
        ];
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return new BroadcastMessage($this->toArray($notifiable));
    }

    public function broadcastType(): string
    {
        return 'lease.rent_reviewed';
    }
}

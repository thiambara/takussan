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
 * TCK-088 — Sent to the tenant when their lease deposit has been refunded.
 * Channel selection respects each user's preferences via PreferenceResolver.
 *
 * Refund attachments (photos, repair invoices) are exposed as direct media
 * URLs on the in-app payload and as inline links in the mail body so the
 * tenant can review the retention justification without logging in.
 */
class LeaseDepositRefundNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public const EVENT_TYPE = 'lease_deposit_refunded';

    public function __construct(
        public Lease $lease,
        public float $refunded,
        public float $retained,
        public string $reason,
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
        $currency = $this->lease->currency?->value ?? '';

        $message = (new MailMessage)
            ->subject(__('notifications.lease_deposit_refunded.subject', ['reference' => $reference]))
            ->greeting(__('notifications.lease_deposit_refunded.greeting'))
            ->line(__('notifications.lease_deposit_refunded.intro', [
                'reference' => $reference,
                'amount' => number_format($this->refunded, 2),
                'currency' => $currency,
            ]));

        if ($this->retained > 0) {
            $message->line(__('notifications.lease_deposit_refunded.retention', [
                'amount' => number_format($this->retained, 2),
                'currency' => $currency,
                'reason' => $this->reason !== '' ? $this->reason : '—',
            ]));
        }

        foreach ($this->attachments() as $attachment) {
            $message->line('• '.$attachment['name'].' — '.$attachment['url']);
        }

        return $message->salutation(__('notifications.salutation'));
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'lease_id' => $this->lease->id,
            'lease_reference' => $this->lease->reference_number,
            'refunded' => $this->refunded,
            'retained' => $this->retained,
            'reason' => $this->reason !== '' ? $this->reason : null,
            'currency' => $this->lease->currency?->value,
            'attachments' => $this->attachments(),
            'title' => __('notifications.lease_deposit_refunded.subject', [
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
        return 'lease.deposit_refunded';
    }

    /**
     * @return list<array{id:int,name:string,url:string}>
     */
    protected function attachments(): array
    {
        return $this->lease->getMedia('lease_deposit_refund')
            ->map(fn ($media) => [
                'id' => $media->id,
                'name' => $media->name,
                'url' => $media->getFullUrl(),
            ])
            ->values()
            ->all();
    }
}

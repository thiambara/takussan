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
 * TCK-089 — Sent to the tenant when their lease has been renewed/amended.
 * Channel selection respects each user's preferences via PreferenceResolver
 * on the `lease_renewed` event.
 */
class LeaseRenewedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public const EVENT_TYPE = 'lease_renewed';

    /**
     * @param  array<string,array{from:mixed,to:mixed}>  $changes
     */
    public function __construct(
        public Lease $parent,
        public Lease $child,
        public array $changes = [],
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
        $reference = $this->child->reference_number ?? '#'.$this->child->id;

        return (new MailMessage)
            ->subject(__('notifications.lease_renewed.subject', ['reference' => $reference]))
            ->greeting(__('notifications.lease_renewed.greeting'))
            ->line(__('notifications.lease_renewed.intro', ['reference' => $reference]))
            ->line(__('notifications.lease_renewed.period', [
                'start' => optional($this->child->start_date)->toDateString() ?? '—',
                'end' => optional($this->child->end_date)->toDateString() ?? '—',
            ]))
            ->salutation(__('notifications.salutation'));
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'parent_lease_id' => $this->parent->id,
            'child_lease_id' => $this->child->id,
            'reference_number' => $this->child->reference_number,
            'start_date' => optional($this->child->start_date)->toDateString(),
            'end_date' => optional($this->child->end_date)->toDateString(),
            'monthly_rent' => $this->child->monthly_rent !== null ? (float) $this->child->monthly_rent : null,
            'changes' => $this->changes,
            'title' => __('notifications.lease_renewed.subject', [
                'reference' => $this->child->reference_number ?? '#'.$this->child->id,
            ]),
        ];
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return new BroadcastMessage($this->toArray($notifiable));
    }

    public function broadcastType(): string
    {
        return 'lease.renewed';
    }
}

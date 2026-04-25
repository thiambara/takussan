<?php

namespace App\Notifications;

use App\Models\Invoice;
use App\Models\Lease;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-090 — Single notification class for all three early-termination
 * transitions (`requested`, `cancelled`, `confirmed`). One class keeps the
 * translation keys grouped and avoids three near-duplicate `via/toMail/
 * toArray` triplets. Channels for each transition are filtered through
 * `PreferenceResolver` against the same `lease_early_termination` event
 * type — the user toggles the topic, not the transition.
 */
class LeaseEarlyTerminationNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public const EVENT_TYPE = 'lease_early_termination';

    public const TRANSITION_REQUESTED = 'requested';

    public const TRANSITION_CANCELLED = 'cancelled';

    public const TRANSITION_CONFIRMED = 'confirmed';

    public function __construct(
        public Lease $lease,
        public string $transition,
        public ?Invoice $invoice = null,
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
        $effective = optional($this->lease->early_termination_effective_date)->toDateString() ?? '—';
        $penalty = $this->lease->early_termination_penalty_amount !== null
            ? (float) $this->lease->early_termination_penalty_amount
            : null;

        $subjectKey = "notifications.lease_early_termination.{$this->transition}.subject";
        $introKey = "notifications.lease_early_termination.{$this->transition}.intro";

        $message = (new MailMessage)
            ->subject(__($subjectKey, ['reference' => $reference]))
            ->greeting(__('notifications.lease_early_termination.greeting'))
            ->line(__($introKey, ['reference' => $reference, 'date' => $effective]));

        if ($this->transition === self::TRANSITION_REQUESTED && $penalty !== null && $penalty > 0) {
            $message->line(__('notifications.lease_early_termination.penalty_line', [
                'amount' => number_format($penalty, 0, '.', ' '),
                'currency' => $this->lease->currency?->value ?? 'XOF',
            ]));
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
            'reference_number' => $this->lease->reference_number,
            'transition' => $this->transition,
            'effective_date' => optional($this->lease->early_termination_effective_date)->toDateString(),
            'penalty_amount' => $this->lease->early_termination_penalty_amount !== null
                ? (float) $this->lease->early_termination_penalty_amount
                : null,
            'invoice_id' => $this->invoice?->id ?? $this->lease->early_termination_invoice_id,
            'reason' => $this->lease->early_termination_reason,
            'title' => __("notifications.lease_early_termination.{$this->transition}.subject", [
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
        return 'lease.early_termination.'.$this->transition;
    }
}

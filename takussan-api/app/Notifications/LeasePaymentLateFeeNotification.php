<?php

namespace App\Notifications;

use App\Models\Enums\Currency;
use App\Models\LeasePayment;
use App\Services\Formatting\CurrencyFormatter;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Number;

/**
 * TCK-087 — Sent to the tenant when a late fee is applied on one of
 * their lease payments. Channel selection respects each user's
 * preferences via PreferenceResolver.
 */
class LeasePaymentLateFeeNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public const EVENT_TYPE = 'lease_payment_overdue';

    public function __construct(
        public LeasePayment $payment,
        public float $amount,
        public float $percent,
        public float $base,
        // TCK-593 — la pénalité est-elle incluse dans le paiement en ligne ? Lu sur l'agence du bail
        // à l'envoi, par la même méthode que `LeasePaymentResource::late_fee_payable_online`.
        public bool $lateFeePayableOnline = false,
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
        $reference = $this->payment->reference_number ?? '#'.$this->payment->id;

        return (new MailMessage)
            ->subject(__('notifications.lease_late_fee_applied.subject', ['reference' => $reference]))
            ->greeting(__('notifications.lease_late_fee_applied.greeting'))
            ->line(__('notifications.lease_late_fee_applied.intro', [
                'reference' => $reference,
                'amount' => app(CurrencyFormatter::class)->format($this->amount, $this->payment->currency ?? Currency::XOF, app()->getLocale()),
            ]))
            ->line(__('notifications.lease_late_fee_applied.details', [
                'percent' => Number::format($this->percent, maxPrecision: 2, locale: app()->getLocale()),
                'base' => app(CurrencyFormatter::class)->format($this->base, $this->payment->currency ?? Currency::XOF, app()->getLocale()),
            ]))
            ->line($this->settlementLine())
            ->salutation(__('notifications.salutation'));
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'lease_payment_id' => $this->payment->id,
            'lease_id' => $this->payment->lease_id,
            'amount' => $this->amount,
            'percent' => $this->percent,
            'base' => $this->base,
            'currency' => $this->payment->currency?->value,
            'late_fee_payable_online' => $this->lateFeePayableOnline,
            'settlement' => $this->settlementLine(),
            'title' => __('notifications.lease_late_fee_applied.subject', [
                'reference' => $this->payment->reference_number ?? '#'.$this->payment->id,
            ]),
        ];
    }

    /** TCK-593 — où et comment régler la pénalité : l'une des deux phrases, jamais les deux. */
    private function settlementLine(): string
    {
        return $this->lateFeePayableOnline
            ? __('notifications.lease_late_fee_applied.pay_online')
            : __('notifications.lease_late_fee_applied.pay_at_agency');
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return new BroadcastMessage($this->toArray($notifiable));
    }

    public function broadcastType(): string
    {
        return 'lease_payment.late_fee_applied';
    }
}

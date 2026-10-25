<?php

namespace App\Notifications;

use App\Models\Enums\Currency;
use App\Models\Invoice;
use App\Notifications\Concerns\AlertsWhenMarkedDeliveryFails;
use App\Services\Formatting\CurrencyFormatter;
use App\Services\Notifications\NotificationRenderer;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-092 — Reminder fired by `SendOverdueRemindersJob` once per
 * configured offset day (default 3 / 7 / 15 days past `due_date`).
 *
 * Channel selection goes through {@see PreferenceResolver} against the
 * `invoice_reminder_sent` event, so a user can opt-out of email/push
 * but still keep the in-app trail (inapp is locked on globally).
 *
 * Locale: we honor `User.locale` via `$notifiable->preferredLocale()`
 * which Laravel calls automatically when {@see HasLocalePreference} is
 * implemented on the User model. Both `messages.php` and
 * `notifications.php` ship FR/EN/WO entries to back this.
 */
class InvoiceOverdueReminderNotification extends Notification implements ShouldQueue
{
    use AlertsWhenMarkedDeliveryFails;
    use Queueable;

    public const EVENT_TYPE = 'invoice_reminder_sent';

    public function __construct(
        public Invoice $invoice,
        public int $offsetDays,
    ) {}

    /** TCK-1794 (P142.02) — l'objet que l'alerte d'un envoi abandonné désigne. */
    protected function sujetDeLEnvoi(): ?Model
    {
        return $this->invoice;
    }

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
        $reference = $this->invoice->reference_number ?? '#'.$this->invoice->id;
        $amount = app(CurrencyFormatter::class)->format((float) $this->invoice->total_amount, $this->invoice->currency ?? Currency::XOF, app()->getLocale());
        // TCK-2325 (P128.03) — la date par le formateur du rendu par code (`LL`).
        $dueDate = app(NotificationRenderer::class)->formatDate($this->invoice->due_date, app()->getLocale());

        return (new MailMessage)
            ->subject(__('notifications.invoice_reminder_sent.subject', ['reference' => $reference]))
            ->greeting(__('notifications.invoice_reminder_sent.greeting'))
            ->line(__('notifications.invoice_reminder_sent.intro', [
                'reference' => $reference,
                'days' => $this->offsetDays,
                'due_date' => $dueDate,
            ]))
            ->line(__('notifications.invoice_reminder_sent.amount', [
                'amount' => $amount,
            ]))
            ->line(__('notifications.invoice_reminder_sent.cta'))
            ->salutation(__('notifications.salutation'));
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'invoice_id' => $this->invoice->id,
            'reference_number' => $this->invoice->reference_number,
            'offset_days' => $this->offsetDays,
            'amount' => (float) $this->invoice->total_amount,
            'currency' => $this->invoice->currency?->value ?? 'XOF',
            'due_date' => $this->invoice->due_date?->toDateString(),
            'title' => __('notifications.invoice_reminder_sent.subject', [
                'reference' => $this->invoice->reference_number ?? '#'.$this->invoice->id,
            ]),
        ];
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return new BroadcastMessage($this->toArray($notifiable));
    }

    public function broadcastType(): string
    {
        return 'invoice.reminder_sent';
    }
}

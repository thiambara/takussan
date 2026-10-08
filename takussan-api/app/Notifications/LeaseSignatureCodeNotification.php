<?php

namespace App\Notifications;

use App\Notifications\Channels\SmsChannel;
use App\Notifications\Concerns\SupportsSms;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-596 §4B (ADR-0042 §2) — le code qui vaut signature d'un bail. SMS sur un numéro vérifié,
 * sinon e-mail ; jamais les deux. Sans lien : un code de consentement ne s'accorde pas d'un clic.
 *
 * Le SMS passe par {@see SmsChannel}, qui refuse un numéro non vérifié et borne à 5 SMS par heure
 * et par utilisateur, code critique compris.
 */
class LeaseSignatureCodeNotification extends Notification implements SupportsSms
{
    use Queueable;

    public const CHANNEL_SMS = 'sms';

    public const CHANNEL_MAIL = 'mail';

    public function __construct(
        public readonly string $code,
        public readonly string $reference,
        public readonly int $expiresInMinutes,
        public readonly string $channel,
    ) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return [$this->channel === self::CHANNEL_SMS ? SmsChannel::class : 'mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject(__('notifications.lease_signature_code.subject', ['reference' => $this->reference]))
            ->greeting(__('notifications.lease_signature_code.greeting'))
            ->line(__('notifications.lease_signature_code.intro', ['reference' => $this->reference]))
            ->line('**'.$this->code.'**')
            ->line(__('notifications.lease_signature_code.expires', ['minutes' => $this->expiresInMinutes]))
            ->line(__('notifications.lease_signature_code.ignore'))
            ->salutation(__('notifications.salutation'));
    }

    public function toSms(object $notifiable): string
    {
        return __('notifications.lease_signature_code.sms', [
            'code' => $this->code,
            'reference' => $this->reference,
            'minutes' => $this->expiresInMinutes,
        ]);
    }

    public function shouldSendSms(): bool
    {
        return $this->channel === self::CHANNEL_SMS;
    }

    public function isCriticalSms(): bool
    {
        return true;
    }
}

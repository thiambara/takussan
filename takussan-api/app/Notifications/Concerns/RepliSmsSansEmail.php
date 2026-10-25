<?php

namespace App\Notifications\Concerns;

use App\Notifications\Channels\SmsChannel;

/**
 * P193.04 (TCK-2051) — un avis du compte qui ne partait que par `mail` : `MailChannel::send` sort
 * sans rien faire quand le destinataire n'a pas d'adresse, et l'avis disparaissait sans trace pour
 * un compte créé par téléphone. Sans e-mail, il part par SMS au numéro VÉRIFIÉ (comme le code de
 * suppression, TCK-589) ; sans l'un ni l'autre, aucun canal.
 *
 * La classe qui l'emploie implémente {@see SupportsSms} et son `toSms()`.
 */
trait RepliSmsSansEmail
{
    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return self::canauxPour($notifiable);
    }

    /** @return list<string> */
    public static function canauxPour(object $notifiable): array
    {
        if (is_string($notifiable->email ?? null) && $notifiable->email !== '') {
            return ['mail'];
        }
        if (is_string($notifiable->phone ?? null) && $notifiable->phone !== '' && ($notifiable->phone_verified_at ?? null) !== null) {
            return [SmsChannel::class];
        }

        return [];
    }

    public function shouldSendSms(): bool
    {
        return true;
    }

    /** Un avis de suppression de compte (RGPD) : ni préférence ni heures calmes. */
    public function isCriticalSms(): bool
    {
        return true;
    }

    public function smsEventType(): string
    {
        return 'account_deletion';
    }
}

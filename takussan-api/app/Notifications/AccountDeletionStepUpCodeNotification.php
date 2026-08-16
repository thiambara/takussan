<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-272 — porte le code à 6 chiffres qui remplace le mot de passe pour
 * les comptes dont le hash en base est une valeur machine.
 *
 * Volontairement SANS lien cliquable : c'est un code de confirmation d'un
 * acte destructif, pas une invitation à agir depuis un e-mail. Un
 * destinataire qui n'a rien demandé n'a rien à cliquer, juste à ignorer.
 */
class AccountDeletionStepUpCodeNotification extends Notification
{
    use Queueable;

    public function __construct(
        public readonly string $code,
        public readonly int $expiresInMinutes,
    ) {}

    /** @return array<int,string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject(__('notifications.account_deletion_step_up.subject'))
            ->greeting(__('notifications.account_deletion_step_up.greeting'))
            ->line(__('notifications.account_deletion_step_up.intro'))
            ->line('**'.$this->code.'**')
            ->line(__('notifications.account_deletion_step_up.expires', ['minutes' => $this->expiresInMinutes]))
            ->line(__('notifications.account_deletion_step_up.ignore'))
            ->salutation(__('notifications.salutation'));
    }
}

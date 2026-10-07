<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;

/**
 * TCK-075 — Delivered to the managing agent/owner when a visit is
 * requested on one of their properties. Gated by the recipient's
 * `visit_reminder` channel preferences (re-used for all visit events
 * to match TCK-070's matrix).
 *
 * TCK-590 — l'heure est donnée à Dakar, suivie du fuseau, et l'e-mail porte de quoi joindre le
 * visiteur : c'est à l'agence de rappeler. Jamais de SMS : la demande vient d'un tiers.
 */
class VisitRequestedNotification extends VisitNotification
{
    protected function cle(): string
    {
        return 'visit_requested';
    }

    public function toMail(object $notifiable): MailMessage
    {
        $mail = parent::toMail($notifiable);

        $contact = array_filter([$this->visit->visitor_phone, $this->visit->visitor_email]);
        if ($contact !== []) {
            $mail->line(__('notifications.visit_requested_contact', ['contact' => implode(' · ', $contact)]));
        }

        return $mail;
    }

    public function broadcastType(): string
    {
        return 'visit.requested';
    }
}

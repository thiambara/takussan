<?php

// Fixture de ProseLitteraleInterditeTest — jamais exécutée. Chemin `Notifications/` : (c) et (g).

class PositifsNotification
{
    public function toMail($notifiable)
    {
        return (new MailMessage)
            // (c) sujet littéral
            ->subject('Votre paiement a été reçu')
            // (c) ligne littérale
            ->line('Merci pour votre confiance.')
            // (g) number_format, sans condition de littéral
            ->line(__('notifications.amount', ['amount' => number_format($this->amount, 2)]));
    }

    public function toArray($notifiable): array
    {
        // (c) 'title' => littéral
        return ['title' => 'Paiement reçu', 'body' => __('notifications.codes.lease_payment.recorded.body')];
    }
}

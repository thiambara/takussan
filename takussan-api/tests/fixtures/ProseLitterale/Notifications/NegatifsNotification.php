<?php

// Fixture de ProseLitteraleInterditeTest — jamais exécutée. AUCUN positif.

class NegatifsNotification
{
    public function toMail($notifiable)
    {
        return (new MailMessage)
            ->subject(__('notifications.codes.lease_payment.recorded.title'))
            ->greeting(__('notifications.greeting'))
            ->line(__('notifications.codes.lease_payment.recorded.body', ['amount' => app(CurrencyFormatter::class)->format($this->amount, 'XOF', 'fr')]))
            ->salutation(__('notifications.salutation'));
    }

    public function toArray($notifiable): array
    {
        return ['title' => __('notifications.title'), 'code' => 'lease_payment.recorded'];
    }
}

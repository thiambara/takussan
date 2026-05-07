<?php

namespace App\Notifications;

use App\Models\DataExport;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class DataExportReadyNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly DataExport $export) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Votre export de données est prêt')
            ->line('Votre archive de portabilité Takussan est prête.')
            ->action('Télécharger mon export', url("/api/data-exports/{$this->export->id}/download"))
            ->line('Ce lien expire dans 7 jours.');
    }
}

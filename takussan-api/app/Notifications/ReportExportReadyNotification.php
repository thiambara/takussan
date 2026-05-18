<?php

namespace App\Notifications;

use App\Models\ReportExport;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class ReportExportReadyNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly ReportExport $export) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Votre export de rapport est prêt')
            ->line("L'export du rapport « {$this->export->report} » est prêt au téléchargement.")
            ->action('Télécharger', url("/api/admin/reports/{$this->export->report}/exports/{$this->export->id}/download"))
            ->line('Ce lien expire dans 7 jours.');
    }
}

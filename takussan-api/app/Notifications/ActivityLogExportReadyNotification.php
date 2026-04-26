<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class ActivityLogExportReadyNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public readonly string $downloadUrl,
        public readonly string $filename,
        public readonly int $rowCount,
    ) {}

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Votre export du journal d\'audit est prêt')
            ->greeting('Bonjour,')
            ->line("Votre export du journal d'audit ({$this->rowCount} entrées) est prêt.")
            ->line('Le lien de téléchargement expire dans 24 heures.')
            ->action('Télécharger l\'export', $this->downloadUrl)
            ->line('Fichier : '.$this->filename)
            ->salutation('Cordialement, l\'équipe Takussan');
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'download_url' => $this->downloadUrl,
            'filename' => $this->filename,
            'row_count' => $this->rowCount,
        ];
    }
}

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
            ->subject(__('notifications.activity_log_export.subject'))
            ->greeting(__('notifications.activity_log_export.greeting'))
            ->line(trans_choice('notifications.activity_log_export.intro', $this->rowCount, ['count' => $this->rowCount]))
            ->line(__('notifications.activity_log_export.expires'))
            ->action(__('notifications.activity_log_export.action'), $this->downloadUrl)
            ->line(__('notifications.activity_log_export.file', ['filename' => $this->filename]))
            ->salutation(__('notifications.salutation'));
    }

    /**
     * TCK-1143 (P63.04) — sans l'URL signée : rangée ici, elle passerait dans `app_notifications`
     * le jour où la cloche s'ajoute à `via()`, comme avant TCK-821.
     *
     * @return array<string,mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'filename' => $this->filename,
            'row_count' => $this->rowCount,
        ];
    }
}

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
            ->subject(__('notifications.report_export.subject'))
            ->line(__('notifications.report_export.intro', ['report' => $this->export->report]))
            ->action(__('notifications.report_export.action'), url("/api/admin/reports/{$this->export->report}/exports/{$this->export->id}/download"))
            ->line(__('notifications.report_export.expires'));
    }
}

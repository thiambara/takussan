<?php

namespace App\Notifications;

use App\Http\Controllers\Api\ReportExportDownloadController;
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

    /**
     * TCK-1051 (P63.02) — le lien vise la route signée de téléchargement, liée au demandeur et
     * échue avec l'export. Il visait `/api/admin/reports/{report}/exports/{id}/download`, qu'aucune
     * route ne déclarait : le clic rendait 404.
     */
    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject(__('notifications.report_export.subject'))
            ->line(__('notifications.report_export.intro', ['report' => $this->export->report]))
            ->action(__('notifications.report_export.action'), ReportExportDownloadController::signedUrl($this->export))
            ->line(__('notifications.report_export.expires'));
    }
}

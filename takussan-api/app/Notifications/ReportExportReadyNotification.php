<?php

namespace App\Notifications;

use App\Http\Controllers\Api\ReportExportDownloadController;
use App\Models\ReportExport;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Lang;

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
        // P155.04 (TCK-1439) — le rapport nommé, plus son code.
        $cle = 'notifications.report_export.reports.'.$this->export->report;
        $report = Lang::has($cle) ? (string) __($cle) : (string) $this->export->report;

        return (new MailMessage)
            // P155.05 (TCK-1441) — les formules du dépôt, plus celles du gabarit de Laravel.
            ->greeting(__('notifications.greeting'))
            ->subject(__('notifications.report_export.subject'))
            ->line(__('notifications.report_export.intro', ['report' => $report]))
            ->action(__('notifications.report_export.action'), ReportExportDownloadController::signedUrl($this->export))
            ->line(__('notifications.report_export.expires'))
            ->salutation(__('notifications.salutation'));
    }
}

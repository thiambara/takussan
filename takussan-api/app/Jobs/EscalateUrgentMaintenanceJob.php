<?php

namespace App\Jobs;

use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\NotificationType;
use App\Models\MaintenanceRequest;
use App\Notifications\UrgentMaintenanceCreatedNotification;
use App\Services\Model\NotificationService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Notification;

class EscalateUrgentMaintenanceJob implements ShouldQueue
{
    use Queueable;

    public function __construct()
    {
        //
    }

    public function handle(NotificationService $notifications): void
    {
        $requests = MaintenanceRequest::with(['property.agency.primaryAdmin', 'assignee'])
            ->where('priority', MaintenancePriority::Urgent->value)
            ->where('created_at', '<=', now()->subMinutes(30))
            ->whereIn('status', [MaintenanceStatus::Open->value, MaintenanceStatus::Acknowledged->value])
            ->whereNull('metadata->escalated_at')
            ->get();

        foreach ($requests as $mr) {
            $manager = $mr->property?->agency?->primaryAdmin;

            if ($manager) {
                // We use the existing urgent notification, or just a direct AppNotification.
                // The ticket says: "alerte agence manager".
                // We'll dispatch a custom NotificationService notify call.
                $notifications->notify(
                    $manager,
                    NotificationType::Maintenance,
                    'ESCALADE URGENTE',
                    "La demande de maintenance #{$mr->id} ({$mr->title}) est URGENTE et n'a pas été traitée depuis plus de 30 minutes.",
                    ['maintenance_request_id' => $mr->id]
                );

                // Send the App\Notifications\UrgentMaintenanceCreatedNotification just in case
                Notification::send($manager, new UrgentMaintenanceCreatedNotification($mr));
            }

            // Mark as escalated
            $metadata = $mr->metadata ?? [];
            $metadata['escalated_at'] = now()->toIso8601String();
            $mr->metadata = $metadata;
            $mr->saveQuietly();
        }
    }
}

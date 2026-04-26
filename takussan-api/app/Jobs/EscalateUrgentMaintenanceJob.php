<?php

namespace App\Jobs;

use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Notifications\UrgentMaintenanceCreatedNotification;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Notification;

class EscalateUrgentMaintenanceJob implements ShouldQueue
{
    use Queueable;

    public function handle(): void
    {
        $requests = MaintenanceRequest::with(['property.agency.primaryAdmin'])
            ->where('priority', MaintenancePriority::Urgent->value)
            ->where('created_at', '<=', now()->subMinutes(30))
            ->whereIn('status', [MaintenanceStatus::Open->value, MaintenanceStatus::Acknowledged->value])
            ->whereNull('metadata->escalated_at')
            ->get();

        foreach ($requests as $mr) {
            $manager = $mr->property?->agency?->primaryAdmin;

            if ($manager) {
                Notification::send($manager, new UrgentMaintenanceCreatedNotification($mr, isEscalation: true));
            }

            $metadata = $mr->metadata ?? [];
            $metadata['escalated_at'] = now()->toIso8601String();
            $mr->metadata = $metadata;
            $mr->saveQuietly();
        }
    }
}

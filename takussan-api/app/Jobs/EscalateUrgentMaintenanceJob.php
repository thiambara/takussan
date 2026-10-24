<?php

namespace App\Jobs;

use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Notifications\UrgentMaintenanceCreatedNotification;
use App\Services\Membership\AdminsDeLAgence;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
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
            ->whereNull('metadata->'.MaintenanceRequest::ESCALATED_AT)
            ->get()
            // TCK-1991 (P169.03) — les 30 minutes courent depuis le passage en urgent. `created_at`
            // ci-dessus n'est qu'un préfiltre : le passage en urgent ne le précède jamais.
            ->filter(function (MaintenanceRequest $mr): bool {
                $since = $mr->metadata[MaintenanceRequest::URGENT_SINCE] ?? null;

                return $since === null || Carbon::parse($since)->lte(now()->subMinutes(30));
            });

        foreach ($requests as $mr) {
            // TCK-2185 (P225.01) — l'administrateur principal s'il est joignable, sinon les
            // administrateurs joignables ; `escalated_at` reste posé, et l'absence dite au journal.
            $agency = $mr->property?->agency;
            $destinataires = AdminsDeLAgence::principalSinonDestinataires($agency);

            if ($destinataires->isNotEmpty()) {
                Notification::send($destinataires, new UrgentMaintenanceCreatedNotification($mr, isEscalation: true));
            } else {
                Log::warning('Escalade d\'intervention urgente sans destinataire joignable', [
                    'maintenance_request_id' => $mr->id,
                    'agency_id' => $agency?->id,
                ]);
            }

            $metadata = $mr->metadata ?? [];
            $metadata[MaintenanceRequest::ESCALATED_AT] = now()->toIso8601String();
            $mr->metadata = $metadata;
            $mr->saveQuietly();
        }
    }
}

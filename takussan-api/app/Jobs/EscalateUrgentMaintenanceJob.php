<?php

namespace App\Jobs;

use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Notifications\UrgentMaintenanceCreatedNotification;
use App\Services\Membership\AdminsDeLAgence;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;

class EscalateUrgentMaintenanceJob implements ShouldQueue
{
    use Queueable;

    public function handle(): void
    {
        $requests = $this->selection()
            ->with(['property.agency.primaryAdmin'])
            ->where('created_at', '<=', now()->subMinutes(30))
            ->get()
            ->filter(fn (MaintenanceRequest $mr): bool => $this->urgenteDepuisTrenteMinutes($mr));

        foreach ($requests as $candidate) {
            // P229.03 (TCK-2225) — la demande est relue sous verrou et la sélection rejugée : une
            // demande annulée ou remise en priorité normale pendant le passage n'est pas escaladée,
            // et `escalated_at` s'écrit sur la `metadata` relue, sans écraser ce qui a été écrit
            // entre-temps. L'avis part après le commit.
            $mr = DB::transaction(function () use ($candidate): ?MaintenanceRequest {
                /** @var MaintenanceRequest|null $fraiche */
                $fraiche = $this->selection()
                    ->whereKey($candidate->getKey())
                    ->lockForUpdate()
                    ->first();

                if ($fraiche === null || ! $this->urgenteDepuisTrenteMinutes($fraiche)) {
                    return null;
                }

                $metadata = $fraiche->metadata ?? [];
                $metadata[MaintenanceRequest::ESCALATED_AT] = now()->toIso8601String();
                $fraiche->metadata = $metadata;
                $fraiche->saveQuietly();

                return $fraiche;
            });

            if ($mr === null) {
                continue;
            }

            $mr->load('property.agency.primaryAdmin');

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
        }
    }

    /**
     * Les demandes à escalader : urgentes, ouvertes ou prises en compte, pas encore escaladées.
     *
     * @return Builder<MaintenanceRequest>
     */
    private function selection(): Builder
    {
        return MaintenanceRequest::query()
            ->where('priority', MaintenancePriority::Urgent->value)
            ->whereIn('status', [MaintenanceStatus::Open->value, MaintenanceStatus::Acknowledged->value])
            ->whereNull('metadata->'.MaintenanceRequest::ESCALATED_AT);
    }

    /**
     * TCK-1991 (P169.03) — les 30 minutes courent depuis le passage en urgent. `created_at` n'est
     * qu'un préfiltre de la lecture en lot : le passage en urgent ne le précède jamais.
     */
    private function urgenteDepuisTrenteMinutes(MaintenanceRequest $mr): bool
    {
        $since = $mr->metadata[MaintenanceRequest::URGENT_SINCE] ?? null;

        return $since === null || Carbon::parse($since)->lte(now()->subMinutes(30));
    }
}

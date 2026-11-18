<?php

namespace App\Listeners\Maintenance;

use App\Events\Maintenance\MaintenanceScheduleChanged;
use App\Services\Messaging\FilDeLObjet;
use Illuminate\Contracts\Events\ShouldHandleEventsAfterCommit;

/**
 * TCK-2961 (ADR-0128 § 3) — le passage d'une intervention fixé ou déplacé parle dans son fil
 * (`maintenance.slot_set`), avec l'instant posé. Sans fil d'intervention, rien. Aucun geste attendu.
 */
class EcritLeCreneauDansLeFil implements ShouldHandleEventsAfterCommit
{
    public function __construct(private readonly FilDeLObjet $fil) {}

    public function handle(MaintenanceScheduleChanged $event): void
    {
        $mr = $event->maintenanceRequest;
        $this->fil->parler($mr, 'maintenance.slot_set', [
            'scheduled_at' => $mr->scheduled_at?->toIso8601String(),
        ]);
    }
}

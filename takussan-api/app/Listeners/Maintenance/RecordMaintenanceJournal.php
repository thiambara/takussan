<?php

namespace App\Listeners\Maintenance;

use App\Events\Maintenance\MaintenanceStatusChanged;
use App\Models\Enums\MaintenanceStatus;
use App\Services\Maintenance\MaintenanceJournal;

/**
 * TCK-2786 — une entrée du journal par changement de statut ou d'assignation : `status.<cause>`,
 * avec `from` et `to`, et l'auteur du geste (`null` : le système).
 *
 * Synchrone, et après le commit de la transition : {@see MaintenanceStatusChanged} est
 * `ShouldDispatchAfterCommit`, l'entrée ne date donc jamais une transition annulée. Découvert par
 * Laravel (`app/Listeners`) : aucun `Event::listen` ne l'inscrit, sans quoi chaque entrée serait
 * doublée.
 *
 * Le contexte de l'événement (motif du refus, commentaire de la contestation) n'est PAS recopié :
 * le journal ne montre que ce que la fiche montre déjà ({@see MaintenanceJournal}). TCK-2917 — le
 * motif d'une annulation (`cancellation_reason`), que la fiche montre, l'est.
 */
class RecordMaintenanceJournal
{
    public function __construct(private readonly MaintenanceJournal $journal) {}

    public function handle(MaintenanceStatusChanged $event): void
    {
        $this->journal->record(
            $event->maintenanceRequest,
            MaintenanceJournal::STATUS_PREFIX.$event->cause,
            $event->actor,
            [
                'from' => $event->from?->value,
                'to' => $event->to->value,
                // TCK-2917 (ADR-0118 § 1) — le motif d'une annulation, lu sur la colonne que la fiche
                // montre déjà : la seule exception à « ni motif ni commentaire ».
                'reason' => $event->to === MaintenanceStatus::Cancelled ? $event->maintenanceRequest->cancellation_reason : null,
            ],
        );
    }
}

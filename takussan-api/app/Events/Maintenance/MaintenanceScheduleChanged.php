<?php

namespace App\Events\Maintenance;

use App\Models\MaintenanceRequest;
use App\Models\User;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * TCK-2012 (P184.01) — le passage d'une intervention a été fixé ou déplacé (`scheduled_at` a
 * réellement changé, vers une heure non nulle).
 *
 * Distinct de {@see MaintenanceStatusChanged} : ni le statut ni l'assignation n'ont bougé, et les
 * autres lecteurs de celui-ci (le fil de l'intervention, la facture) n'ont rien à y faire.
 *
 * `ShouldDispatchAfterCommit` : émis dans la transaction du `PATCH`, il ne part que si elle aboutit.
 */
class MaintenanceScheduleChanged implements ShouldDispatchAfterCommit
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public MaintenanceRequest $maintenanceRequest,
        public ?User $actor,
    ) {}
}

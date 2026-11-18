<?php

namespace App\Listeners\Lease;

use App\Events\Lease\LeaseEarlyTerminationRequested;
use App\Services\Messaging\FilDeLObjet;
use Illuminate\Contracts\Events\ShouldHandleEventsAfterCommit;

/**
 * TCK-2961 (ADR-0128 § 3) — un préavis donné parle dans la salle du bail (`lease.notice_given`), avec
 * sa date d'effet. L'événement est émis DANS la transaction d'`EarlyTerminationService::request` et
 * n'est pas `ShouldDispatchAfterCommit` : l'écouteur, lui, attend le COMMIT — un préavis annulé
 * n'écrit rien. Aucun geste attendu (la pénalité ne sort pas : elle n'est pas dans `data`).
 */
class EcritLePreavisDansLeFil implements ShouldHandleEventsAfterCommit
{
    public function __construct(private readonly FilDeLObjet $fil) {}

    public function handle(LeaseEarlyTerminationRequested $event): void
    {
        $this->fil->parler($event->lease, 'lease.notice_given', [
            'effective_date' => $event->lease->early_termination_effective_date?->toDateString(),
        ]);
    }
}

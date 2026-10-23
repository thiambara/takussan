<?php

namespace App\Observers;

use App\Models\Lease;

class LeaseObserver
{
    public function updated(Lease $lease): void
    {
        if (! $lease->wasChanged('status') || $lease->agency_id === null) {
            return;
        }

        // P162.02 (TCK-1714) — le bail en préavis reste en cours. Le compteur d'une agence se
        // recalcule au prochain changement de statut d'un de ses baux.
        $count = Lease::where('agency_id', $lease->agency_id)
            ->whereIn('status', Lease::ONGOING_STATUSES)
            ->count();

        $lease->agency()->update(['active_leases_count' => $count]);
    }
}

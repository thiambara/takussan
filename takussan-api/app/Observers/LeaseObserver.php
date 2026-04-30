<?php

namespace App\Observers;

use App\Models\Enums\LeaseStatus;
use App\Models\Lease;

class LeaseObserver
{
    public function updated(Lease $lease): void
    {
        if (! $lease->wasChanged('status') || $lease->agency_id === null) {
            return;
        }

        $count = Lease::where('agency_id', $lease->agency_id)
            ->where('status', LeaseStatus::Active)
            ->count();

        $lease->agency()->update(['active_leases_count' => $count]);
    }
}

<?php

namespace App\Events\Lease;

use App\Models\Lease;
use App\Models\User;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * TCK-091 — Fired after a successful rent review on an active lease.
 * The lease's `monthly_rent` has already been updated; the activity log
 * row has been written. Listeners only need to notify the tenant.
 */
class LeaseRentReviewed
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public Lease $lease,
        public User $actor,
        public float $oldRent,
        public float $newRent,
        public string $reason,
        public string $effectiveDate,
        public bool $forced,
    ) {}
}

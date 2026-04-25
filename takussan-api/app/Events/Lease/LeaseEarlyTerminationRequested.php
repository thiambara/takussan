<?php

namespace App\Events\Lease;

use App\Models\Invoice;
use App\Models\Lease;
use App\Models\User;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * TCK-090 — Fired when a tenant or agent requests early termination of a
 * lease. The penalty invoice is already created at this point; downstream
 * listeners only need the lease + invoice + actor to notify stakeholders.
 */
class LeaseEarlyTerminationRequested
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public Lease $lease,
        public ?Invoice $invoice,
        public User $actor,
    ) {}
}

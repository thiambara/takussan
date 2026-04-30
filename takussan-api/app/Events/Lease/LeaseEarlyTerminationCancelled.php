<?php

namespace App\Events\Lease;

use App\Models\Lease;
use App\Models\User;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * TCK-090 — Fired when an early-termination request is cancelled before
 * the effective date and while the penalty invoice is still unpaid.
 */
class LeaseEarlyTerminationCancelled
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public Lease $lease,
        public User $actor,
    ) {}
}

<?php

namespace App\Events\Lease;

use App\Models\Lease;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * TCK-090 — Fired by the daily job (or a manual confirm call) once the
 * effective date is reached AND the penalty invoice is settled.
 */
class LeaseEarlyTerminationConfirmed
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public Lease $lease,
    ) {}
}

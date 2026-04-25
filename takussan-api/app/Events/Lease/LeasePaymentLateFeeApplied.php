<?php

namespace App\Events\Lease;

use App\Models\LeasePayment;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * TCK-087 — Fired right after `LateFeeCalculator::apply` persists a
 * penalty on a `LeasePayment`. Carries the computed `amount`, the
 * `percent` rate (per-lease), and the `base` (remaining amount) so
 * downstream consumers don't need to re-derive them.
 */
class LeasePaymentLateFeeApplied
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public LeasePayment $payment,
        public float $amount,
        public float $percent,
        public float $base,
    ) {}
}

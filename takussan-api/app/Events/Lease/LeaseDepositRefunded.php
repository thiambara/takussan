<?php

namespace App\Events\Lease;

use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * TCK-088 — Fired right after `DepositRefundService::refund` persists a
 * caution refund. Carries the lease, the LeasePayment row that records the
 * refund, the outflow Payout, the optional retention Invoice, and the
 * decomposed amounts so listeners don't need to re-derive them.
 *
 * `ShouldDispatchAfterCommit` defers the dispatch until the surrounding
 * DB transaction commits — the tenant must not get a "refund applied"
 * notification for a transaction that ultimately rolls back.
 */
class LeaseDepositRefunded implements ShouldDispatchAfterCommit
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public Lease $lease,
        public LeasePayment $payment,
        public Payout $payout,
        public ?Invoice $invoice,
        public float $refunded,
        public float $retained,
        public string $reason,
    ) {}
}

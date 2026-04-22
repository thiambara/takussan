<?php

namespace App\Services\Model;

use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use Carbon\Carbon;

/**
 * Calculates and applies late-fee penalties on overdue lease payments.
 *
 * Rate and grace period come from config:
 *   - config('takussan.leases.late_fee_rate')        default 0.05 (5%)
 *   - config('takussan.leases.late_fee_grace_days')  default 5 days
 *
 * A payment is considered late when `due_date + grace_days < today` and
 * the payment is still in `pending` or `late` status (not paid/refunded).
 * Fees are capped at one application per payment (idempotent) — rerunning
 * the service will not stack fees on top of an already-penalised payment.
 */
class LeaseLateFeeService
{
    public function __construct(
        protected ?float $rate = null,
        protected ?int $graceDays = null,
    ) {}

    public function rate(): float
    {
        return $this->rate ?? (float) config('takussan.leases.late_fee_rate', 0.05);
    }

    public function graceDays(): int
    {
        return $this->graceDays ?? (int) config('takussan.leases.late_fee_grace_days', 5);
    }

    /**
     * Calculate the late-fee amount for a single payment, without
     * persisting anything. Returns 0 if the payment is not overdue
     * past the grace period.
     */
    public function calculate(LeasePayment $payment, ?Carbon $now = null): float
    {
        $now ??= now();
        $dueDate = $payment->due_date ? Carbon::parse($payment->due_date) : null;

        if (! $dueDate || ! in_array($payment->status, [PaymentStatus::Pending, PaymentStatus::Late], true)) {
            return 0.0;
        }

        $effectiveDue = $dueDate->copy()->addDays($this->graceDays());
        if ($now->lessThanOrEqualTo($effectiveDue)) {
            return 0.0;
        }

        return round(((float) $payment->amount) * $this->rate(), 2);
    }

    /**
     * Apply the calculated late fee to the payment and flip its status
     * to `late`. No-ops if the payment already has a non-zero late_fee.
     * Returns the amount that was just applied (0 if nothing changed).
     */
    public function apply(LeasePayment $payment, ?Carbon $now = null): float
    {
        if ((float) ($payment->late_fee ?? 0) > 0) {
            return 0.0;
        }

        $amount = $this->calculate($payment, $now);
        if ($amount <= 0) {
            return 0.0;
        }

        $payment->update([
            'late_fee' => $amount,
            'status' => PaymentStatus::Late,
        ]);

        return $amount;
    }

    /**
     * Sweep all overdue pending/late payments and apply penalties to
     * those that haven't yet been charged. Returns the count of
     * payments that received a new fee.
     */
    public function applyAll(?Carbon $now = null): int
    {
        $now ??= now();

        $query = LeasePayment::query()
            ->whereIn('status', [PaymentStatus::Pending, PaymentStatus::Late])
            ->where(function ($q) {
                $q->whereNull('late_fee')->orWhere('late_fee', 0);
            })
            ->whereDate('due_date', '<', $now->copy()->subDays($this->graceDays())->toDateString());

        $count = 0;
        $query->chunkById(200, function ($chunk) use (&$count, $now) {
            foreach ($chunk as $payment) {
                if ($this->apply($payment, $now) > 0) {
                    $count++;
                }
            }
        });

        return $count;
    }
}

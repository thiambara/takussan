<?php

namespace App\Services\Lease;

use App\Events\Lease\LeasePaymentLateFeeApplied;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Setting;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * TCK-087 — Calculates and applies late-fee penalties on overdue lease
 * payments.
 *
 * Per-lease config drives the rate and grace window:
 *   - `Lease.late_fee_percent`     null/0  → no penalty
 *   - `Lease.late_fee_grace_days`  null    → 0 days grace
 *
 * The basis is the **remaining amount** (`amount - paid_amount`) — partial
 * payments only attract a penalty on what is still owed.
 *
 * A global cap can be set via `Setting('late_fees.cap_percent')` (treated
 * as % of `amount`) — applied as an upper clamp on the computed fee.
 *
 * Idempotency: once `late_fee_applied_at` is set on a `LeasePayment`,
 * the calculator never re-applies. There is at most one penalty per
 * payment row.
 */
class LateFeeCalculator
{
    /**
     * Compute the penalty amount that *would* be applied right now,
     * without persisting anything. Returns 0 when not applicable
     * (no config, in grace, already applied, terminal status, etc.).
     */
    public function compute(LeasePayment $payment, ?CarbonInterface $now = null): float
    {
        if (! $this->isApplicable($payment, $now)) {
            return 0.0;
        }

        $lease = $payment->lease;
        $percent = (float) ($lease->late_fee_percent ?? 0);

        $base = $this->base($payment);
        if ($base <= 0.0) {
            return 0.0;
        }

        $fee = round($base * $percent / 100, 2);

        return $this->applyCap($payment, $fee);
    }

    /**
     * True when the payment is past `due_date + grace_days`, has a
     * non-zero `late_fee_percent` on its lease, hasn't already been
     * penalised, and is in an open status (`pending` / `partially_paid`
     * / `late`).
     */
    public function isApplicable(LeasePayment $payment, ?CarbonInterface $now = null): bool
    {
        if ($payment->late_fee_applied_at !== null) {
            return false;
        }

        $lease = $payment->lease;
        if (! $lease instanceof Lease) {
            return false;
        }

        $percent = (float) ($lease->late_fee_percent ?? 0);
        if ($percent <= 0.0) {
            return false;
        }

        $openStatuses = [
            PaymentStatus::Pending,
            PaymentStatus::PartiallyPaid,
            PaymentStatus::Late,
        ];
        if (! in_array($payment->status, $openStatuses, true)) {
            return false;
        }

        if ($payment->due_date === null) {
            return false;
        }

        $now = $now ? Carbon::instance($now) : now();
        $graceDays = (int) ($lease->late_fee_grace_days ?? 0);
        $effectiveDue = Carbon::parse($payment->due_date)->copy()->addDays($graceDays);

        return $now->greaterThan($effectiveDue);
    }

    /**
     * Apply the calculated penalty: persist on the payment, dispatch the
     * `LeasePaymentLateFeeApplied` event, and write an ActivityLog entry.
     * Returns the amount applied (0 when nothing changed).
     */
    public function apply(LeasePayment $payment, ?CarbonInterface $now = null): float
    {
        $amount = $this->compute($payment, $now);
        if ($amount <= 0.0) {
            return 0.0;
        }

        $now = $now ? Carbon::instance($now) : now();
        $percent = (float) ($payment->lease->late_fee_percent ?? 0);
        $base = $this->base($payment);

        // Guard against concurrent invocations (manual dispatch outside the
        // scheduler's `withoutOverlapping` lock) by re-checking inside a
        // row-level transaction. Without this, two workers can both read
        // `late_fee_applied_at = null` and both write a fee.
        return DB::transaction(function () use ($payment, $now, $amount, $percent, $base) {
            $locked = LeasePayment::query()
                ->whereKey($payment->id)
                ->lockForUpdate()
                ->first();

            if ($locked === null || $locked->late_fee_applied_at !== null) {
                return 0.0;
            }

            $locked->forceFill([
                'late_fee_amount' => $amount,
                'late_fee_applied_at' => $now,
                'status' => PaymentStatus::Late,
            ])->save();

            activity('LeasePayment')
                ->performedOn($locked)
                ->withProperties([
                    'amount' => $amount,
                    'percent' => $percent,
                    'base' => $base,
                ])
                ->event('late_fee_applied')
                ->log('late_fee_applied');

            LeasePaymentLateFeeApplied::dispatch($locked->fresh(), $amount, $percent, $base);

            return $amount;
        });
    }

    /**
     * Remaining amount that the late-fee is computed against.
     */
    protected function base(LeasePayment $payment): float
    {
        $remaining = (float) $payment->remaining_amount;

        return $remaining > 0.0 ? round($remaining, 2) : 0.0;
    }

    /**
     * Optional global cap from `Setting('late_fees.cap_percent')` —
     * treated as a % of `amount` (the original due, not the remaining).
     */
    protected function applyCap(LeasePayment $payment, float $fee): float
    {
        $cap = $this->capPercent();
        if ($cap === null) {
            return $fee;
        }

        $ceiling = round(((float) $payment->amount) * $cap / 100, 2);

        return min($fee, $ceiling);
    }

    protected function capPercent(): ?float
    {
        $row = Setting::query()
            ->where('key', 'late_fees.cap_percent')
            ->first();

        if ($row === null) {
            return null;
        }

        $value = $row->value;
        if (is_array($value)) {
            $value = $value['value'] ?? array_values($value)[0] ?? null;
        }

        if ($value === null || $value === '') {
            return null;
        }

        return (float) $value;
    }
}

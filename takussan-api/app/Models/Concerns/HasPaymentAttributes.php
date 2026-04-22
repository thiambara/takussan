<?php

namespace App\Models\Concerns;

use App\Models\Enums\Currency;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PaymentStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;

/**
 * Shared payment attributes (casts, scopes and computed accessors) used by
 * `BookingPayment` and `LeasePayment`.
 *
 * Partial payment semantics:
 *   - `amount` is the total amount **due** for the payment entry.
 *   - The portion effectively paid is stored in `metadata.paid_amount`
 *     (null/missing = 0 when pending, = `amount` when status is `paid`).
 *   - `remaining_amount` is derived: `amount - paid_amount` (never negative).
 */
trait HasPaymentAttributes
{
    public function initializeHasPaymentAttributes(): void
    {
        $this->mergeCasts([
            'amount' => 'decimal:2',
            'currency' => Currency::class,
            'payment_method' => PaymentMethod::class,
            'status' => PaymentStatus::class,
            'paid_at' => 'datetime',
        ]);
    }

    public static function bootHasPaymentAttributes(): void
    {
        static::updating(function ($payment): void {
            if (! $payment->isDirty('status')) {
                return;
            }

            $original = $payment->getOriginal('status');
            $new = $payment->status;

            $originalEnum = $original instanceof PaymentStatus
                ? $original
                : (is_string($original) ? PaymentStatus::tryFrom($original) : null);
            $newEnum = $new instanceof PaymentStatus
                ? $new
                : (is_string($new) ? PaymentStatus::tryFrom($new) : null);

            if ($originalEnum === null || $newEnum === null) {
                return;
            }

            // Terminal states: once a payment is paid or refunded, it cannot
            // revert to pending/partially_paid/late.
            $terminalOrigins = [PaymentStatus::Paid, PaymentStatus::Refunded];
            $openTargets = [
                PaymentStatus::Pending,
                PaymentStatus::PartiallyPaid,
                PaymentStatus::Late,
            ];

            if (in_array($originalEnum, $terminalOrigins, true)
                && in_array($newEnum, $openTargets, true)) {
                abort(422, sprintf(
                    'Invalid payment status transition: %s → %s.',
                    $originalEnum->value,
                    $newEnum->value,
                ));
            }
        });
    }

    public function scopePaid(Builder $query): Builder
    {
        return $query->where('status', PaymentStatus::Paid);
    }

    public function scopePending(Builder $query): Builder
    {
        return $query->where('status', PaymentStatus::Pending);
    }

    public function scopePartiallyPaid(Builder $query): Builder
    {
        return $query->where('status', PaymentStatus::PartiallyPaid);
    }

    /**
     * Matches lease-payment rows past their `due_date` and still not paid,
     * OR rows whose status is explicitly `late`. The `due_date` column does
     * not exist on booking_payments, so that branch is applied conditionally.
     */
    public function scopeOverdue(Builder $query): Builder
    {
        $today = now()->toDateString();

        return $query->where(function (Builder $q) use ($today): void {
            $q->where('status', PaymentStatus::Late);

            if ($this->hasDueDateColumn()) {
                $q->orWhere(function (Builder $inner) use ($today): void {
                    $inner->whereIn('status', [
                        PaymentStatus::Pending,
                        PaymentStatus::PartiallyPaid,
                    ])
                        ->whereNotNull('due_date')
                        ->whereDate('due_date', '<', $today);
                });
            }
        });
    }

    protected function hasDueDateColumn(): bool
    {
        $fillable = $this->getFillable();

        return in_array('due_date', $fillable, true);
    }

    /**
     * Effective amount already received for this payment row.
     *
     * - `paid`     → full `amount` (unless overridden by metadata.paid_amount)
     * - `refunded` → `amount - refund_amount` (when `refund_amount` exists)
     * - `partially_paid` → metadata.paid_amount (must be provided)
     * - any other status → metadata.paid_amount (fallback to 0)
     */
    protected function paidAmount(): Attribute
    {
        return Attribute::get(function (): float {
            $status = $this->status;
            $amount = (float) ($this->amount ?? 0);
            $metaPaid = (float) (is_array($this->metadata ?? null)
                ? ($this->metadata['paid_amount'] ?? 0)
                : 0);

            if ($status === PaymentStatus::Paid) {
                return $metaPaid > 0 ? min($metaPaid, $amount) : $amount;
            }

            if ($status === PaymentStatus::Refunded) {
                $refund = (float) ($this->attributes['refund_amount'] ?? 0);

                return max(0.0, $amount - $refund);
            }

            return max(0.0, min($metaPaid, $amount));
        });
    }

    /**
     * Remaining amount owed on this payment row, derived from `amount` and
     * the effective `paid_amount`. Never negative.
     */
    protected function remainingAmount(): Attribute
    {
        return Attribute::get(function (): float {
            $amount = (float) ($this->amount ?? 0);
            $paid = (float) $this->paid_amount;

            return round(max(0.0, $amount - $paid), 2);
        });
    }
}

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

    /**
     * Explicit allowed transitions matrix. Any pair not listed here is rejected.
     *
     * Rules:
     *   - `pending`/`partially_paid`/`late` are interchangeable open states and
     *     can move to any terminal state (`paid`, `refunded`) or to `failed`.
     *   - `failed` is recoverable — a retried collection can flow back to any
     *     open state or to `paid`, but not directly to `refunded`.
     *   - `paid` may only be refunded (no retroactive flip to failed).
     *   - `refunded` is terminal.
     *
     * @var array<string, list<PaymentStatus>>
     */
    protected static array $allowedPaymentTransitions = [];

    protected static function paymentTransitionMatrix(): array
    {
        if (self::$allowedPaymentTransitions !== []) {
            return self::$allowedPaymentTransitions;
        }

        $openAndTerminals = [
            PaymentStatus::Paid,
            PaymentStatus::PartiallyPaid,
            PaymentStatus::Late,
            PaymentStatus::Failed,
            PaymentStatus::Refunded,
        ];

        return self::$allowedPaymentTransitions = [
            PaymentStatus::Pending->value => $openAndTerminals,
            PaymentStatus::PartiallyPaid->value => [
                PaymentStatus::Paid,
                PaymentStatus::PartiallyPaid,
                PaymentStatus::Late,
                PaymentStatus::Failed,
                PaymentStatus::Refunded,
            ],
            PaymentStatus::Late->value => [
                PaymentStatus::Paid,
                PaymentStatus::PartiallyPaid,
                PaymentStatus::Late,
                PaymentStatus::Failed,
                PaymentStatus::Refunded,
            ],
            PaymentStatus::Failed->value => [
                PaymentStatus::Pending,
                PaymentStatus::Paid,
                PaymentStatus::PartiallyPaid,
                PaymentStatus::Late,
                PaymentStatus::Failed,
            ],
            PaymentStatus::Paid->value => [
                PaymentStatus::Paid,
                PaymentStatus::Refunded,
            ],
            PaymentStatus::Refunded->value => [
                PaymentStatus::Refunded,
            ],
        ];
    }

    public static function bootHasPaymentAttributes(): void
    {
        static::saving(function ($payment): void {
            // Refund amount must never exceed the total amount, regardless of
            // the write path (service, controller, direct model update).
            if ($payment->isDirty('refund_amount')) {
                $refund = (float) ($payment->getAttributes()['refund_amount'] ?? 0);
                $amount = (float) ($payment->getAttributes()['amount'] ?? 0);
                if ($refund < 0 || $refund > $amount) {
                    abort(422, 'Refund amount must be between 0 and the payment amount.');
                }
            }

            // metadata.paid_amount is a monetary value — enforce non-negative numeric.
            if ($payment->isDirty('metadata')) {
                $metadata = $payment->metadata;
                if (is_array($metadata) && array_key_exists('paid_amount', $metadata)) {
                    $metaPaid = $metadata['paid_amount'];
                    if (! is_numeric($metaPaid) || (float) $metaPaid < 0) {
                        abort(422, 'metadata.paid_amount must be a non-negative number.');
                    }
                }
            }
        });

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

            $matrix = self::paymentTransitionMatrix();
            $allowed = $matrix[$originalEnum->value] ?? [];

            if (! in_array($newEnum, $allowed, true)) {
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

            // Allow overpayment to surface honestly (no silent clamp): partial
            // payments at the collector, tips, rounding, currency fees can all
            // cause `metadata.paid_amount > amount` legitimately. `remaining_amount`
            // still floors at 0 so UIs don't go negative.
            if ($status === PaymentStatus::Paid) {
                return $metaPaid > 0 ? $metaPaid : $amount;
            }

            if ($status === PaymentStatus::Refunded) {
                $refund = (float) ($this->attributes['refund_amount'] ?? 0);

                return max(0.0, $amount - $refund);
            }

            return max(0.0, $metaPaid);
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

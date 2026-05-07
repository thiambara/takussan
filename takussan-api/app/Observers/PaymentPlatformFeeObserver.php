<?php

namespace App\Observers;

use App\Models\BookingPayment;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Services\Billing\QuotaResolver;

/**
 * TCK-223 — Freeze the platform commission rate (`platform_fee_pct_at_payment`)
 * at the moment a payment becomes `paid`. Once frozen the column is never
 * recomputed, so subsequent plan / override changes don't retroactively
 * alter the net owed to the agency.
 *
 * Single observer wired on both BookingPayment and LeasePayment — the only
 * difference between the two is the agency lookup path (booking → property
 * vs lease).
 */
class PaymentPlatformFeeObserver
{
    public function __construct(private readonly QuotaResolver $quota) {}

    public function saving(BookingPayment|LeasePayment $payment): void
    {
        // Idempotent: only stamp the fee once. After it's set, even a status
        // bounce (paid → refunded → paid via a new entry) shouldn't churn the
        // historical capture.
        if ($payment->platform_fee_pct_at_payment !== null) {
            return;
        }

        if (! $this->isTransitioningToPaid($payment)) {
            return;
        }

        $agencyId = $this->resolveAgencyId($payment);
        if ($agencyId === null) {
            return;
        }

        $payment->platform_fee_pct_at_payment = $this->quota->effectivePlatformFeePctForAgency($agencyId);
    }

    private function isTransitioningToPaid(BookingPayment|LeasePayment $payment): bool
    {
        $next = $payment->status instanceof PaymentStatus
            ? $payment->status
            : PaymentStatus::tryFrom((string) $payment->status);

        if ($next !== PaymentStatus::Paid) {
            return false;
        }

        if (! $payment->exists) {
            return true;
        }

        $original = $payment->getOriginal('status');
        $originalEnum = $original instanceof PaymentStatus
            ? $original
            : (is_string($original) ? PaymentStatus::tryFrom($original) : null);

        return $originalEnum !== PaymentStatus::Paid;
    }

    private function resolveAgencyId(BookingPayment|LeasePayment $payment): ?int
    {
        if ($payment instanceof BookingPayment) {
            $booking = $payment->booking()->first(['id', 'agency_id', 'property_id']);

            return $booking?->agency_id ?? $booking?->property()->value('agency_id');
        }

        $lease = $payment->lease()->first(['id', 'agency_id']);

        return $lease?->agency_id;
    }
}

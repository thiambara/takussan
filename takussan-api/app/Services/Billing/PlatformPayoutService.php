<?php

namespace App\Services\Billing;

use App\Models\Agency;
use App\Models\BookingPayment;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PlatformPayoutStatus;
use App\Models\LeasePayment;
use App\Models\PlatformPayout;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class PlatformPayoutService
{
    /**
     * Allowed transitions matrix for PlatformPayoutStatus.
     *
     * @var array<string, list<PlatformPayoutStatus>>
     */
    private const TRANSITIONS = [
        'pending' => [PlatformPayoutStatus::Approved, PlatformPayoutStatus::Cancelled],
        'approved' => [PlatformPayoutStatus::Processing, PlatformPayoutStatus::Paid, PlatformPayoutStatus::Cancelled],
        'processing' => [PlatformPayoutStatus::Paid, PlatformPayoutStatus::Failed],
        'failed' => [PlatformPayoutStatus::Approved, PlatformPayoutStatus::Cancelled],
    ];

    /**
     * Closes a billing period for one or all agencies. Idempotent: a second
     * call for the same `(agency_id, period_end)` returns the existing payout
     * (or 409 if a non-cancelled one already exists).
     *
     * @return array<int, PlatformPayout>
     */
    public function closePeriod(?Agency $agency, Carbon $periodEnd, User $actor): array
    {
        $periodEnd = $periodEnd->copy()->endOfDay();
        $created = [];

        $agencyIds = $agency
            ? [$agency->id]
            : $this->agenciesWithUnpaidEligiblePayments($periodEnd);

        foreach ($agencyIds as $agencyId) {
            $created[] = DB::transaction(fn () => $this->closeForAgency($agencyId, $periodEnd, $actor));
        }

        return array_values(array_filter($created));
    }

    public function approve(PlatformPayout $payout, User $actor): PlatformPayout
    {
        $this->assertTransition($payout, PlatformPayoutStatus::Approved);

        $payout->update([
            'status' => PlatformPayoutStatus::Approved,
            'approved_by' => $actor->id,
        ]);

        $this->logAction($payout, $actor, 'super_admin_payout_approved');

        return $payout->refresh();
    }

    public function markPaid(PlatformPayout $payout, User $actor, Carbon $processedAt, ?array $metadata = null): PlatformPayout
    {
        $this->assertTransition($payout, PlatformPayoutStatus::Paid);

        $payout->update([
            'status' => PlatformPayoutStatus::Paid,
            'processed_at' => $processedAt,
            'metadata' => array_merge($payout->metadata ?? [], $metadata ?? []),
        ]);

        $this->logAction($payout, $actor, 'super_admin_payout_marked_paid');

        return $payout->refresh();
    }

    public function cancel(PlatformPayout $payout, User $actor, string $reason): PlatformPayout
    {
        $this->assertTransition($payout, PlatformPayoutStatus::Cancelled);

        DB::transaction(function () use ($payout, $reason): void {
            // Detach payments — they become eligible for a future close-period.
            BookingPayment::query()->where('platform_payout_id', $payout->id)
                ->update(['platform_payout_id' => null]);
            LeasePayment::query()->where('platform_payout_id', $payout->id)
                ->update(['platform_payout_id' => null]);

            $payout->update([
                'status' => PlatformPayoutStatus::Cancelled,
                'failure_reason' => $reason,
            ]);
        });

        $this->logAction($payout, $actor, 'super_admin_payout_cancelled', ['reason' => $reason]);

        return $payout->refresh();
    }

    /**
     * Single SQL aggregation per payment type — returns the breakdown without
     * loading individual payment rows. AC: ≤ 2 queries.
     *
     * @return array{booking: array, lease: array}
     */
    public function breakdown(PlatformPayout $payout): array
    {
        $booking = BookingPayment::query()
            ->where('platform_payout_id', $payout->id)
            ->selectRaw('COUNT(*) as count, COALESCE(SUM(amount), 0) as gross, COALESCE(SUM(amount * platform_fee_pct_at_payment / 100), 0) as fees')
            ->first();

        $lease = LeasePayment::query()
            ->where('platform_payout_id', $payout->id)
            ->selectRaw('COUNT(*) as count, COALESCE(SUM(amount), 0) as gross, COALESCE(SUM(amount * platform_fee_pct_at_payment / 100), 0) as fees')
            ->first();

        return [
            'booking' => [
                'count' => (int) ($booking->count ?? 0),
                'gross' => round((float) ($booking->gross ?? 0), 2),
                'fees' => round((float) ($booking->fees ?? 0), 2),
            ],
            'lease' => [
                'count' => (int) ($lease->count ?? 0),
                'gross' => round((float) ($lease->gross ?? 0), 2),
                'fees' => round((float) ($lease->fees ?? 0), 2),
            ],
        ];
    }

    private function closeForAgency(int $agencyId, Carbon $periodEnd, User $actor): ?PlatformPayout
    {
        $existing = PlatformPayout::query()
            ->where('agency_id', $agencyId)
            ->whereDate('period_end', $periodEnd->toDateString())
            ->where('status', '!=', PlatformPayoutStatus::Cancelled)
            ->lockForUpdate()
            ->first();

        if ($existing !== null) {
            throw new HttpException(409, "A payout already exists for agency #{$agencyId} for period {$periodEnd->toDateString()}.");
        }

        $bookingPayments = BookingPayment::query()
            ->whereHas('booking', fn ($q) => $q->where('agency_id', $agencyId))
            ->where('status', PaymentStatus::Paid)
            ->whereNotNull('paid_at')
            ->where('paid_at', '<=', $periodEnd)
            ->whereNull('platform_payout_id')
            ->lockForUpdate()
            ->get(['id', 'amount', 'platform_fee_pct_at_payment', 'paid_at', 'currency']);

        $leasePayments = LeasePayment::query()
            ->whereHas('lease', fn ($q) => $q->where('agency_id', $agencyId))
            ->where('status', PaymentStatus::Paid)
            ->whereNotNull('paid_at')
            ->where('paid_at', '<=', $periodEnd)
            ->whereNull('platform_payout_id')
            ->lockForUpdate()
            ->get(['id', 'amount', 'platform_fee_pct_at_payment', 'paid_at', 'currency']);

        $eligible = $bookingPayments->concat($leasePayments);
        if ($eligible->isEmpty()) {
            return null;
        }

        $gross = 0.0;
        $fees = 0.0;
        foreach ($eligible as $row) {
            $amount = (float) $row->amount;
            $pct = (float) ($row->platform_fee_pct_at_payment ?? 0);
            $gross += $amount;
            $fees += round($amount * $pct / 100, 2);
        }

        $net = round($gross - $fees, 2);

        $periodStart = $eligible->min('paid_at')
            ? Carbon::parse($eligible->min('paid_at'))->startOfDay()
            : $periodEnd->copy()->startOfMonth();

        $currency = $eligible->first()?->currency;
        $currencyValue = $currency instanceof Currency ? $currency->value : (string) ($currency ?? 'XOF');

        try {
            $payout = PlatformPayout::query()->create([
                'agency_id' => $agencyId,
                'period_start' => $periodStart->toDateString(),
                'period_end' => $periodEnd->toDateString(),
                'gross_amount' => round($gross, 2),
                'platform_fee_amount' => round($fees, 2),
                'net_amount' => $net,
                'currency' => $currencyValue,
                'status' => PlatformPayoutStatus::Pending,
                'metadata' => [
                    'booking_payments_count' => $bookingPayments->count(),
                    'lease_payments_count' => $leasePayments->count(),
                ],
            ]);
        } catch (QueryException $e) {
            // Race condition with the partial unique index — re-check.
            throw new HttpException(409, "A payout already exists for agency #{$agencyId} for period {$periodEnd->toDateString()}.", $e);
        }

        BookingPayment::query()
            ->whereIn('id', $bookingPayments->pluck('id'))
            ->update(['platform_payout_id' => $payout->id]);
        LeasePayment::query()
            ->whereIn('id', $leasePayments->pluck('id'))
            ->update(['platform_payout_id' => $payout->id]);

        $this->logAction($payout, $actor, 'super_admin_payout_period_closed', [
            'period_end' => $periodEnd->toDateString(),
            'agency_id' => $agencyId,
            'gross' => $gross,
            'fees' => $fees,
            'net' => $net,
        ]);

        return $payout;
    }

    /**
     * @return list<int>
     */
    private function agenciesWithUnpaidEligiblePayments(Carbon $periodEnd): array
    {
        $bookingAgencies = BookingPayment::query()
            ->join('bookings', 'bookings.id', '=', 'booking_payments.booking_id')
            ->where('booking_payments.status', PaymentStatus::Paid)
            ->whereNotNull('booking_payments.paid_at')
            ->where('booking_payments.paid_at', '<=', $periodEnd)
            ->whereNull('booking_payments.platform_payout_id')
            ->whereNotNull('bookings.agency_id')
            ->distinct()
            ->pluck('bookings.agency_id');

        $leaseAgencies = LeasePayment::query()
            ->join('leases', 'leases.id', '=', 'lease_payments.lease_id')
            ->where('lease_payments.status', PaymentStatus::Paid)
            ->whereNotNull('lease_payments.paid_at')
            ->where('lease_payments.paid_at', '<=', $periodEnd)
            ->whereNull('lease_payments.platform_payout_id')
            ->whereNotNull('leases.agency_id')
            ->distinct()
            ->pluck('leases.agency_id');

        return $bookingAgencies->concat($leaseAgencies)->unique()->values()->all();
    }

    private function assertTransition(PlatformPayout $payout, PlatformPayoutStatus $next): void
    {
        $current = $payout->status instanceof PlatformPayoutStatus
            ? $payout->status
            : PlatformPayoutStatus::tryFrom((string) $payout->status);

        $allowed = self::TRANSITIONS[$current?->value ?? ''] ?? [];

        if (! in_array($next, $allowed, true)) {
            throw new HttpException(422, sprintf(
                'Invalid platform payout status transition: %s → %s.',
                $current?->value ?? 'unknown',
                $next->value,
            ));
        }
    }

    private function logAction(PlatformPayout $payout, User $actor, string $event, array $properties = []): void
    {
        activity('Billing')
            ->causedBy($actor)
            ->performedOn($payout)
            ->event($event)
            ->withProperties(array_merge(['agency_id' => $payout->agency_id], $properties))
            ->log($event);
    }
}

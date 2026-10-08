<?php

namespace App\Services\Billing;

use App\Exceptions\ApiError;
use App\Models\Agency;
use App\Models\BookingPayment;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PlatformPayoutStatus;
use App\Models\LeasePayment;
use App\Models\PlatformPayout;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Support\SegregationOfDuties;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

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
     * Closes a billing period for one or all agencies.
     *
     * TCK-594 (ADR-0039 §4, §3b) — with an `agency_id`, the historical contract holds: 409 when the
     * period is already closed, and 422 (`platform_payout.agency_frozen`) for an agency that is
     * not `active`. Without it, the global close NEVER stops on one agency: each one runs in its
     * own transaction, and an agency that is not active or already closed is listed in
     * `excluded` with its reason instead. A race lost on the partial unique index is caught
     * OUTSIDE the transaction (PostgreSQL pitfall n° 1) and excludes that agency only.
     *
     * @return array{created: list<PlatformPayout>, excluded: list<array{agency_id: int, reason: string}>}
     */
    public function closePeriod(?Agency $agency, Carbon $periodEnd, User $actor): array
    {
        $periodEnd = $periodEnd->copy()->endOfDay();

        if ($agency !== null) {
            abort_code_unless($agency->status === AgencyStatus::Active, 422, 'platform_payout.agency_frozen');

            try {
                $payout = DB::transaction(fn () => $this->closeForAgency($agency->id, $periodEnd, $actor));
            } catch (UniqueConstraintViolationException) {
                abort_code(409, 'platform_payout.already_exists');
            }

            return ['created' => array_values(array_filter([$payout])), 'excluded' => []];
        }

        $created = [];
        $excluded = [];

        foreach ($this->agenciesWithUnpaidEligiblePayments($periodEnd) as $agencyId) {
            $status = Agency::query()->whereKey($agencyId)->first(['id', 'status'])?->status;
            if ($status !== AgencyStatus::Active) {
                $excluded[] = ['agency_id' => $agencyId, 'reason' => 'agency_not_active'];

                continue;
            }

            try {
                $payout = DB::transaction(fn () => $this->closeForAgency($agencyId, $periodEnd, $actor));
            } catch (UniqueConstraintViolationException) {
                $excluded[] = ['agency_id' => $agencyId, 'reason' => 'already_closed'];

                continue;
            } catch (ApiError $e) {
                if ($e->errorCode !== 'platform_payout.already_exists') {
                    throw $e;
                }
                $excluded[] = ['agency_id' => $agencyId, 'reason' => 'already_closed'];

                continue;
            }

            if ($payout !== null) {
                $created[] = $payout;
            }
        }

        return ['created' => $created, 'excluded' => $excluded];
    }

    /**
     * TCK-594 (ADR-0039 §4) — the second gesture. Never the super-admin who closed the period,
     * never a member of the agency being paid; and only for an agency that is active (frozen
     * otherwise, even when it was active at closing) and, if `standard`, verified.
     */
    public function approve(PlatformPayout $payout, User $actor): PlatformPayout
    {
        DB::transaction(function () use ($payout, $actor): void {
            $locked = PlatformPayout::query()->whereKey($payout->id)->lockForUpdate()->firstOrFail();
            $this->assertTransition($locked, PlatformPayoutStatus::Approved);
            $agency = $this->payableAgency($locked);

            abort_code_if(
                $agency->kind === AgencyKind::Standard && ! $agency->is_verified,
                422,
                'platform_payout.agency_unverified',
            );

            $this->assertNotBeneficiary($actor, $agency, SegregationOfDuties::STEP_APPROVE);
            SegregationOfDuties::assertDistinct($actor, [$locked->closed_by_id], SegregationOfDuties::STEP_APPROVE);

            $locked->update([
                'status' => PlatformPayoutStatus::Approved,
                'approved_by' => $actor->id,
                'approved_at' => now(),
            ]);
        });

        $payout->refresh();
        $this->logAction($payout, $actor, 'super_admin_payout_approved');

        return $payout;
    }

    /**
     * The third gesture: the money left. Never the approver; a payment reference is mandatory;
     * an agency suspended since the approval is frozen.
     *
     * @param  array<string,mixed>|null  $metadata
     */
    public function markPaid(PlatformPayout $payout, User $actor, Carbon $processedAt, string $reference, ?array $metadata = null): PlatformPayout
    {
        DB::transaction(function () use ($payout, $actor, $processedAt, $reference, $metadata): void {
            $locked = PlatformPayout::query()->whereKey($payout->id)->lockForUpdate()->firstOrFail();
            $this->assertTransition($locked, PlatformPayoutStatus::Paid);
            $agency = $this->payableAgency($locked);

            $this->assertNotBeneficiary($actor, $agency, SegregationOfDuties::STEP_PAY);
            SegregationOfDuties::assertDistinct($actor, [$locked->approved_by], SegregationOfDuties::STEP_PAY);

            $reference = trim($reference);
            abort_code_if($reference === '', 422, 'payout.reference_required');

            $locked->update([
                'status' => PlatformPayoutStatus::Paid,
                'processed_at' => $processedAt,
                'paid_by_id' => $actor->id,
                'payment_reference' => $reference,
                'metadata' => array_merge($locked->metadata ?? [], $metadata ?? []),
            ]);
        });

        $payout->refresh();
        $this->logAction($payout, $actor, 'super_admin_payout_marked_paid', ['payment_reference' => $payout->payment_reference]);

        return $payout;
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
            abort_code(409, 'platform_payout.already_exists', ['period_end' => $periodEnd->toDateString()]);
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

        // TCK-594 — la course perdue sur l'index unique partiel n'est PAS attrapée ici : PostgreSQL
        // a déjà abandonné la transaction (piège n° 1). Elle remonte, et `closePeriod` la range.
        $payout = PlatformPayout::query()->create([
            'agency_id' => $agencyId,
            'period_start' => $periodStart->toDateString(),
            'period_end' => $periodEnd->toDateString(),
            'gross_amount' => round($gross, 2),
            'platform_fee_amount' => round($fees, 2),
            'net_amount' => $net,
            'currency' => $currencyValue,
            'status' => PlatformPayoutStatus::Pending,
            'closed_by_id' => $actor->id,
            'metadata' => [
                'booking_payments_count' => $bookingPayments->count(),
                'lease_payments_count' => $leasePayments->count(),
            ],
        ]);

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
            abort_code(422, 'platform_payout.status_transition_invalid', [
                'from' => $current?->value,
                'to' => $next->value,
            ]);
        }
    }

    /** Le gel (ADR-0039 §4) : l'état de l'agence se relit au geste, jamais à la clôture. */
    private function payableAgency(PlatformPayout $payout): Agency
    {
        $agency = Agency::query()->findOrFail($payout->agency_id);
        abort_code_unless($agency->status === AgencyStatus::Active, 422, 'platform_payout.agency_frozen');

        return $agency;
    }

    /** Le bénéficiaire d'un reversement plateforme est l'agence : aucun de ses membres ne le tient. */
    private function assertNotBeneficiary(User $actor, Agency $agency, string $step): void
    {
        SegregationOfDuties::assertDistinct($actor, [$agency->primary_admin_id], $step);
        if (app(MembershipCapabilityResolver::class)->isStaffAt($actor, (int) $agency->id)) {
            SegregationOfDuties::refuse($step);
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

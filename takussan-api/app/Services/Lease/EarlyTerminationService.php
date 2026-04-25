<?php

namespace App\Services\Lease;

use App\Events\Lease\LeaseEarlyTerminationCancelled;
use App\Events\Lease\LeaseEarlyTerminationConfirmed;
use App\Events\Lease\LeaseEarlyTerminationRequested;
use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\Setting;
use App\Models\User;
use App\Services\Model\ReferenceNumberGenerator;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * TCK-090 — Early-termination workflow.
 *
 * Three transitions exposed by the public API:
 *   - request: `active|expired` lease → `terminating`, penalty invoice
 *     created, notice period starts.
 *   - cancel:  `terminating` → `active` while `effective_date > today` and
 *     the penalty invoice has not yet flipped to `paid`.
 *   - confirm: `terminating` → `terminated` once `effective_date` is
 *     reached AND the penalty invoice is settled. Invoked by the daily
 *     `ConfirmEarlyTerminationsJob` or manually by an agent.
 *
 * Penalty formula
 *   `months_remaining = ceil((end_date − effective_date) / 30)`
 *   `penalty = monthly_rent × Setting('lease.early_termination_penalty_months')`
 *   capped at `months_remaining` (you can't penalize more months than what
 *   actually remained on the contract). Setting default = 2.
 *
 * Note on enum case naming: PHP enum cases use PascalCase, so
 * `LeaseStatus::Terminating` corresponds to the DB string `terminating`.
 */
class EarlyTerminationService
{
    public const SETTING_KEY = 'lease.early_termination_penalty_months';

    public const SETTING_DEFAULT_MONTHS = 2;

    public const DEFAULT_NOTICE_DAYS = 30;

    public const REQUESTABLE_STATUSES = [
        LeaseStatus::Active,
        LeaseStatus::Expired,
    ];

    /**
     * @param  array{effective_date:string, reason?:string|null, requested_by_role?:string|null}  $data
     */
    public function request(Lease $lease, User $actor, array $data): Lease
    {
        return DB::transaction(function () use ($lease, $actor, $data) {
            // Lock the row to serialize concurrent requests; without this,
            // two clients can both pass the `Terminating` guard and end up
            // creating two penalty invoices.
            $lease = Lease::query()->lockForUpdate()->findOrFail($lease->id);

            $this->guardRequestable($lease);

            $today = now()->startOfDay();
            $notice = $this->resolveNoticeDays($lease);
            $effective = Carbon::parse($data['effective_date'])->startOfDay();

            $minEffective = $today->copy()->addDays($notice);
            if ($effective->lt($minEffective)) {
                throw ValidationException::withMessages([
                    'effective_date' => [__('messages.lease_early_termination_notice_too_short', [
                        'min' => $minEffective->toDateString(),
                    ])],
                ])->status(422);
            }

            // Caller hits a normal end-of-contract; redirect them to the
            // standard `terminate` flow where no penalty applies.
            if ($lease->end_date && $effective->gte(Carbon::parse($lease->end_date))) {
                throw ValidationException::withMessages([
                    'effective_date' => [__('messages.lease_early_termination_after_end_date')],
                ])->status(422);
            }

            $penalty = $this->computePenalty($lease, $effective);
            $invoice = $penalty > 0 ? $this->createPenaltyInvoice($lease, $actor, $penalty, $effective, $notice) : null;

            $lease->forceFill([
                'status' => LeaseStatus::Terminating,
                'early_termination_requested_at' => now(),
                'early_termination_requested_by' => $actor->id,
                'early_termination_effective_date' => $effective->toDateString(),
                'early_termination_penalty_amount' => $penalty,
                'early_termination_reason' => isset($data['reason']) ? trim((string) $data['reason']) : null,
                'notice_period_days' => $notice,
                'early_termination_invoice_id' => $invoice?->id,
            ])->save();

            activity('Lease')
                ->performedOn($lease)
                ->causedBy($actor)
                ->withProperties([
                    'effective_date' => $effective->toDateString(),
                    'penalty_amount' => $penalty,
                    'invoice_id' => $invoice?->id,
                    'reason' => $lease->early_termination_reason,
                    'requested_by_role' => $data['requested_by_role'] ?? null,
                ])
                ->event('lease_early_termination_requested')
                ->log('lease_early_termination_requested');

            $lease->refresh();
            LeaseEarlyTerminationRequested::dispatch($lease, $invoice, $actor);

            return $lease;
        });
    }

    public function cancel(Lease $lease, User $actor): Lease
    {
        return DB::transaction(function () use ($lease, $actor) {
            $lease = Lease::query()->lockForUpdate()->findOrFail($lease->id);

            if ($lease->status !== LeaseStatus::Terminating) {
                throw ValidationException::withMessages([
                    'status' => [__('messages.lease_early_termination_not_in_progress')],
                ])->status(422);
            }

            $effective = $lease->early_termination_effective_date
                ? Carbon::parse($lease->early_termination_effective_date)->startOfDay()
                : null;
            if ($effective && $effective->lte(now()->startOfDay())) {
                throw ValidationException::withMessages([
                    'effective_date' => [__('messages.lease_early_termination_window_closed')],
                ])->status(422);
            }

            // Lock the penalty invoice (when present) before checking its
            // status: without the lock, a payment processor could flip
            // Sent → Paid in a parallel transaction between this guard and
            // the void below, and we'd cancel a paid invoice. The lease
            // lock above is not enough — payments don't touch the lease row.
            $invoiceId = $lease->early_termination_invoice_id;
            $invoice = $invoiceId ? Invoice::query()->lockForUpdate()->find($invoiceId) : null;

            if ($invoice && $invoice->status === InvoiceStatus::Paid) {
                throw ValidationException::withMessages([
                    'invoice' => [__('messages.lease_early_termination_penalty_paid')],
                ])->status(422);
            }

            // Void the pending penalty invoice if it exists; we keep the row
            // for audit (rather than delete it) and the cancelled state is
            // documented in `Invoice::booted` transitions.
            if ($invoice) {
                $invoice->forceFill(['status' => InvoiceStatus::Cancelled])->save();
            }

            $lease->forceFill([
                'status' => LeaseStatus::Active,
                'early_termination_requested_at' => null,
                'early_termination_requested_by' => null,
                'early_termination_effective_date' => null,
                'early_termination_penalty_amount' => null,
                'early_termination_reason' => null,
                'notice_period_days' => null,
                'early_termination_invoice_id' => null,
            ])->save();

            activity('Lease')
                ->performedOn($lease)
                ->causedBy($actor)
                ->withProperties(['cancelled_invoice_id' => $invoiceId])
                ->event('lease_early_termination_cancelled')
                ->log('lease_early_termination_cancelled');

            $lease->refresh();
            LeaseEarlyTerminationCancelled::dispatch($lease, $actor);

            return $lease;
        });
    }

    public function confirm(Lease $lease, ?User $actor = null): Lease
    {
        return DB::transaction(function () use ($lease, $actor) {
            $lease = Lease::query()->lockForUpdate()->findOrFail($lease->id);

            if ($lease->status !== LeaseStatus::Terminating) {
                throw ValidationException::withMessages([
                    'status' => [__('messages.lease_early_termination_not_in_progress')],
                ])->status(422);
            }

            $effective = $lease->early_termination_effective_date
                ? Carbon::parse($lease->early_termination_effective_date)->startOfDay()
                : null;
            if ($effective && $effective->gt(now()->startOfDay())) {
                throw ValidationException::withMessages([
                    'effective_date' => [__('messages.lease_early_termination_too_early')],
                ])->status(422);
            }

            $penalty = (float) ($lease->early_termination_penalty_amount ?? 0);
            if ($penalty > 0 && ! $this->isPenaltyPaid($lease)) {
                throw ValidationException::withMessages([
                    'invoice' => [__('messages.lease_early_termination_penalty_unpaid')],
                ])->status(422);
            }

            $lease->forceFill([
                'status' => LeaseStatus::Terminated,
                'terminated_at' => now(),
                'terminated_by_id' => $lease->early_termination_requested_by ?? $actor?->id,
                'termination_reason' => $lease->early_termination_reason,
            ])->save();

            activity('Lease')
                ->performedOn($lease)
                ->causedBy($actor)
                ->withProperties([
                    'effective_date' => $effective?->toDateString(),
                    'penalty_amount' => $penalty,
                    'invoice_id' => $lease->early_termination_invoice_id,
                ])
                ->event('lease_early_termination_confirmed')
                ->log('lease_early_termination_confirmed');

            $lease->refresh();
            LeaseEarlyTerminationConfirmed::dispatch($lease);

            return $lease;
        });
    }

    /**
     * Pure calculation — exposed publicly so the frontend can request a
     * preview without actually opening a request.
     */
    public function computePenalty(Lease $lease, CarbonInterface $effectiveDate): float
    {
        $monthlyRent = (float) ($lease->monthly_rent ?? 0);
        if ($monthlyRent <= 0) {
            return 0.0;
        }

        $end = $lease->end_date ? Carbon::parse($lease->end_date) : null;
        if ($end === null || $effectiveDate->gte($end)) {
            return 0.0;
        }

        $diffDays = max(1, (int) $effectiveDate->copy()->startOfDay()->diffInDays($end->copy()->startOfDay(), false));
        $monthsRemaining = (int) ceil($diffDays / 30);

        $configuredMonths = $this->resolvePenaltyMonths();
        $billable = min($configuredMonths, $monthsRemaining);

        return round($monthlyRent * $billable, 2);
    }

    public function resolveNoticeDays(Lease $lease): int
    {
        $value = $lease->notice_period_days;
        if ($value !== null && $value > 0) {
            return (int) $value;
        }

        return self::DEFAULT_NOTICE_DAYS;
    }

    public function resolvePenaltyMonths(): int
    {
        $row = Setting::query()->where('key', self::SETTING_KEY)->first();
        if ($row === null) {
            return self::SETTING_DEFAULT_MONTHS;
        }

        $value = $row->value;
        if (is_array($value)) {
            $value = $value['value'] ?? array_values($value)[0] ?? null;
        }

        $months = (int) $value;

        return $months > 0 ? $months : self::SETTING_DEFAULT_MONTHS;
    }

    protected function guardRequestable(Lease $lease): void
    {
        if ($lease->status === LeaseStatus::Terminating) {
            throw ValidationException::withMessages([
                'status' => [__('messages.lease_early_termination_already_in_progress')],
            ])->status(422);
        }

        if (! in_array($lease->status, self::REQUESTABLE_STATUSES, true)) {
            throw ValidationException::withMessages([
                'status' => [__('messages.lease_early_termination_status_not_requestable')],
            ])->status(422);
        }
    }

    protected function createPenaltyInvoice(
        Lease $lease,
        User $issuedBy,
        float $penalty,
        CarbonInterface $effective,
        int $notice,
    ): Invoice {
        // Mid-notice deadline gives the tenant a real window to settle before
        // the lease actually ends. Floor at +1 day to avoid same-day issues.
        $halfNotice = max(1, (int) floor($notice / 2));
        $dueDate = $effective->copy()->subDays($halfNotice);
        if ($dueDate->lte(now()->startOfDay())) {
            $dueDate = now()->startOfDay()->addDay();
        }

        return Invoice::create([
            'invoiceable_type' => Lease::class,
            'invoiceable_id' => $lease->id,
            'customer_id' => $lease->tenant_id,
            'issued_by_id' => $issuedBy->id,
            'agency_id' => $lease->agency_id,
            'reference_number' => ReferenceNumberGenerator::invoice(),
            'status' => InvoiceStatus::Sent->value,
            'issue_date' => now()->toDateString(),
            'due_date' => $dueDate->toDateString(),
            'subtotal' => $penalty,
            'tax_rate' => 0,
            'tax_amount' => 0,
            'total_amount' => $penalty,
            'currency' => $lease->currency?->value ?? 'XOF',
            'notes' => __('messages.lease_early_termination_invoice_line', [
                'reference' => $lease->reference_number ?? (string) $lease->id,
                'effective' => $effective->toDateString(),
            ]),
        ]);
    }

    protected function isPenaltyPaid(Lease $lease): bool
    {
        if (! $lease->early_termination_invoice_id) {
            return ((float) ($lease->early_termination_penalty_amount ?? 0)) <= 0.0;
        }

        $invoice = Invoice::find($lease->early_termination_invoice_id);

        return $invoice !== null && $invoice->status === InvoiceStatus::Paid;
    }
}

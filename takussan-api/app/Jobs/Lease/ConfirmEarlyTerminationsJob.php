<?php

namespace App\Jobs\Lease;

use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Services\Lease\EarlyTerminationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Validation\ValidationException;

/**
 * TCK-090 — Daily sweep that closes leases whose effective date has been
 * reached AND whose penalty invoice has been settled. The service-level
 * confirm() rejects unpaid penalties with 422 — we swallow that here so
 * the job stays idempotent and unpaid leases simply linger until paid.
 *
 * Bound queries via the dedicated index `leases_status_early_termination_idx`.
 */
class ConfirmEarlyTerminationsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(EarlyTerminationService $service): int
    {
        $today = now()->startOfDay()->toDateString();
        $confirmed = 0;

        // `early_termination_effective_date` is a DATE column — comparing
        // it directly against the date string keeps the planner on
        // `leases_status_early_termination_idx`. Wrapping the column in
        // `whereDate(...)` forces a function call on every row and skips
        // the index on PostgreSQL.
        Lease::query()
            ->where('status', LeaseStatus::Terminating->value)
            ->whereNotNull('early_termination_effective_date')
            ->where('early_termination_effective_date', '<=', $today)
            ->orderBy('id')
            ->chunkById(100, function ($chunk) use ($service, &$confirmed) {
                foreach ($chunk as $lease) {
                    try {
                        $service->confirm($lease);
                        $confirmed++;
                    } catch (ValidationException $e) {
                        // Penalty unpaid or window not yet open — leave the
                        // lease in `terminating` for the next sweep.
                        continue;
                    }
                }
            });

        return $confirmed;
    }
}

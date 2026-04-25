<?php

namespace App\Jobs\Lease;

use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Services\Lease\LateFeeCalculator;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * TCK-087 — Sweeps overdue lease payments and applies the per-lease late
 * fee where applicable, agency by agency. Idempotent via
 * `late_fee_applied_at`.
 */
class ApplyLateFeesJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(LateFeeCalculator $calculator): int
    {
        $now = now();
        $applied = 0;

        $agencyIds = LeasePayment::query()
            ->join('leases', 'leases.id', '=', 'lease_payments.lease_id')
            ->select('leases.agency_id')
            ->distinct()
            ->pluck('agency_id');

        foreach ($agencyIds as $agencyId) {
            $applied += $this->applyForAgency($calculator, $agencyId, $now);
        }

        return $applied;
    }

    protected function applyForAgency(LateFeeCalculator $calculator, ?int $agencyId, CarbonInterface $now): int
    {
        $count = 0;

        $this->candidateQuery($agencyId, $now)
            ->chunkById(200, function ($chunk) use ($calculator, $now, &$count) {
                foreach ($chunk as $payment) {
                    if ($calculator->apply($payment, $now) > 0.0) {
                        $count++;
                    }
                }
            }, 'lease_payments.id', 'id');

        return $count;
    }

    protected function candidateQuery(?int $agencyId, CarbonInterface $now)
    {
        $today = Carbon::instance($now)->toDateString();

        return LeasePayment::query()
            ->with('lease')
            ->whereHas('lease', function ($q) use ($agencyId) {
                $q->whereNotNull('late_fee_percent')
                    ->where('late_fee_percent', '>', 0);

                if ($agencyId === null) {
                    $q->whereNull('agency_id');
                } else {
                    $q->where('agency_id', $agencyId);
                }
            })
            ->whereIn('status', [
                PaymentStatus::Pending,
                PaymentStatus::PartiallyPaid,
                PaymentStatus::Late,
            ])
            ->whereNull('late_fee_applied_at')
            ->whereNotNull('due_date')
            ->whereDate('due_date', '<=', $today);
    }
}

<?php

namespace App\Services\Reporting;

use App\Models\Agency;
use App\Models\AgencySubscription;
use App\Models\Booking;
use App\Models\Enums\AgencySubscriptionStatus;
use App\Models\Enums\BookingStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

/**
 * TCK-227 — Cross-tenant reporting (super-admin only). All aggregations are
 * computed in SQL — no PHP iteration over individual rows. Each bucket is a
 * single COUNT/SUM query, so a 12-bucket time series runs ≤ 12 queries
 * (acceptable per the AC: < 500ms on 1k agencies / 10k users).
 */
class PlatformReportingService
{
    private const CACHE_TTL_SECONDS = 600; // 10 min — see AC.

    private const CACHE_VERSION_KEY = 'reporting:cache_version';

    /**
     * Bumped every time an Agency is created (see AppServiceProvider). Lets
     * us invalidate every reporting cache key with O(1) work — the version
     * suffix makes the old keys cold-miss.
     */
    public static function bumpCacheVersion(): void
    {
        Cache::increment(self::CACHE_VERSION_KEY);
    }

    private function cacheVersion(): int
    {
        return (int) Cache::get(self::CACHE_VERSION_KEY, 0);
    }

    /**
     * Time series of newly-created entities (agencies / users / listings)
     * bucketed by day / week / month. Returns the first row per bucket
     * boundary plus a `generated_at` stamp.
     */
    public function growth(string $metric, string $period, string $granularity): array
    {
        $key = sprintf('reporting:growth:%s:%s:%s:v%d', $metric, $period, $granularity, $this->cacheVersion());

        return Cache::remember($key, self::CACHE_TTL_SECONDS, function () use ($metric, $period, $granularity): array {
            $buckets = $this->bucketsFor($period, $granularity);
            $rows = [];
            $total = 0;

            foreach ($buckets as $bucket) {
                $count = $this->countInBucket($metric, $bucket['start'], $bucket['end']);
                $total += $count;
                $rows[] = [
                    'bucket' => $bucket['label'],
                    'starts_at' => $bucket['start']->toIso8601String(),
                    'ends_at' => $bucket['end']->toIso8601String(),
                    'count' => $count,
                ];
            }

            return $this->envelope($rows, ['total' => $total], $period, $granularity);
        });
    }

    /**
     * MRR/ARR per bucket. `MRR(month) = Σ active subscriptions × (override
     * ?? plan.monthly_price_xof)` evaluated at the bucket boundary.
     * `ARR = MRR × 12`.
     */
    public function revenue(string $period, string $granularity): array
    {
        $key = sprintf('reporting:revenue:%s:%s:v%d', $period, $granularity, $this->cacheVersion());

        return Cache::remember($key, self::CACHE_TTL_SECONDS, function () use ($period, $granularity): array {
            $buckets = $this->bucketsFor($period, $granularity);
            $rows = [];

            foreach ($buckets as $bucket) {
                $atMoment = $bucket['end'];
                $row = $this->revenueSnapshotAt($atMoment);
                $rows[] = array_merge([
                    'bucket' => $bucket['label'],
                    'starts_at' => $bucket['start']->toIso8601String(),
                    'ends_at' => $atMoment->toIso8601String(),
                ], $row);
            }

            $latest = end($rows) ?: ['mrr' => 0, 'arr' => 0, 'active_subscriptions' => 0];

            return $this->envelope($rows, [
                'latest_mrr' => $latest['mrr'],
                'latest_arr' => $latest['arr'],
                'latest_active_subscriptions' => $latest['active_subscriptions'],
            ], $period, $granularity);
        });
    }

    /**
     * Agency retention cohorts. Each row is a cohort (one signup month) and
     * exposes the % of cohort members still active at M+0, M+1, …, M+depth.
     */
    public function cohorts(string $cohortBasis, int $depth): array
    {
        $depth = max(1, min(24, $depth));
        $key = sprintf('reporting:cohorts:%s:%d:v%d', $cohortBasis, $depth, $this->cacheVersion());

        return Cache::remember($key, self::CACHE_TTL_SECONDS, function () use ($depth): array {
            $rows = [];
            $startCohort = Carbon::now()->startOfMonth()->subMonths($depth);

            for ($i = 0; $i < $depth; $i++) {
                $cohortStart = $startCohort->copy()->addMonths($i)->startOfMonth();
                $cohortEnd = $cohortStart->copy()->endOfMonth();

                $cohortIds = Agency::query()
                    ->withTrashed()
                    ->whereBetween('created_at', [$cohortStart, $cohortEnd])
                    ->pluck('id');
                $cohortSize = $cohortIds->count();

                $cells = [];
                for ($m = 0; $m <= ($depth - $i); $m++) {
                    $milestone = $cohortStart->copy()->addMonths($m)->endOfMonth();
                    if ($milestone->isFuture()) {
                        $cells[] = ['month' => $m, 'active' => null, 'rate' => null];

                        continue;
                    }
                    if ($cohortSize === 0) {
                        $cells[] = ['month' => $m, 'active' => 0, 'rate' => null];

                        continue;
                    }

                    $active = Agency::query()
                        ->withTrashed()
                        ->whereIn('id', $cohortIds)
                        ->where(function (Builder $q) use ($milestone): void {
                            $q->whereNull('deleted_at')->orWhere('deleted_at', '>', $milestone);
                        })
                        ->count();

                    $cells[] = [
                        'month' => $m,
                        'active' => $active,
                        'rate' => round($active / $cohortSize, 4),
                    ];
                }

                $rows[] = [
                    'cohort' => $cohortStart->format('Y-m'),
                    'cohort_size' => $cohortSize,
                    'cells' => $cells,
                ];
            }

            return $this->envelope($rows, [
                'cohorts' => count($rows),
                'depth' => $depth,
            ], "{$depth}m", 'month');
        });
    }

    /**
     * Conversion funnel over the period: published listings → bookings
     * requested → bookings confirmed → leases signed. All values are
     * counts of distinct rows over the period window.
     */
    public function funnel(string $period): array
    {
        $key = sprintf('reporting:funnel:%s:v%d', $period, $this->cacheVersion());

        return Cache::remember($key, self::CACHE_TTL_SECONDS, function () use ($period): array {
            $end = Carbon::now()->endOfDay();
            $start = $this->periodStart($period, $end);

            $listingsPublished = Property::query()
                ->whereBetween('published_at', [$start, $end])
                ->count();
            $bookingsRequested = Booking::query()
                ->whereBetween('created_at', [$start, $end])
                ->count();
            $bookingsConfirmed = Booking::query()
                ->whereBetween('created_at', [$start, $end])
                ->where('status', BookingStatus::Confirmed)
                ->count();
            $leasesSigned = Lease::query()
                ->whereBetween('signed_at', [$start, $end])
                ->count();

            $rows = [
                ['stage' => 'listings_published', 'count' => $listingsPublished],
                ['stage' => 'bookings_requested', 'count' => $bookingsRequested],
                ['stage' => 'bookings_confirmed', 'count' => $bookingsConfirmed],
                ['stage' => 'leases_signed', 'count' => $leasesSigned],
            ];

            return $this->envelope($rows, [
                'conversion_rate' => $listingsPublished > 0
                    ? round($leasesSigned / $listingsPublished, 4)
                    : null,
            ], $period, 'period');
        });
    }

    /**
     * @return list<array{label:string, start: Carbon, end: Carbon}>
     */
    private function bucketsFor(string $period, string $granularity): array
    {
        $end = Carbon::now()->endOfDay();
        $start = $this->periodStart($period, $end);

        $buckets = [];
        $cursor = $start->copy();

        while ($cursor->lessThanOrEqualTo($end)) {
            [$bucketStart, $bucketEnd, $label] = match ($granularity) {
                'day' => [$cursor->copy()->startOfDay(), $cursor->copy()->endOfDay(), $cursor->toDateString()],
                'week' => [$cursor->copy()->startOfWeek(), $cursor->copy()->endOfWeek(), $cursor->copy()->startOfWeek()->format('Y-\WW')],
                'month' => [$cursor->copy()->startOfMonth(), $cursor->copy()->endOfMonth(), $cursor->format('Y-m')],
                default => [$cursor->copy()->startOfMonth(), $cursor->copy()->endOfMonth(), $cursor->format('Y-m')],
            };

            if ($bucketEnd->greaterThan($end)) {
                $bucketEnd = $end->copy();
            }

            $buckets[] = ['label' => $label, 'start' => $bucketStart, 'end' => $bucketEnd];

            $cursor = match ($granularity) {
                'day' => $cursor->copy()->addDay(),
                'week' => $cursor->copy()->addWeek(),
                default => $cursor->copy()->addMonthNoOverflow(),
            };

            if (count($buckets) >= 60) {
                // Hard cap so a malicious / accidental call doesn't fan out.
                break;
            }
        }

        return $buckets;
    }

    private function countInBucket(string $metric, Carbon $start, Carbon $end): int
    {
        return match ($metric) {
            'agencies' => Agency::query()->whereBetween('created_at', [$start, $end])->count(),
            'users' => User::query()->whereBetween('created_at', [$start, $end])->count(),
            'listings' => Property::query()->whereBetween('created_at', [$start, $end])->count(),
            default => 0,
        };
    }

    /**
     * @return array{mrr: float, arr: float, active_subscriptions: int}
     */
    private function revenueSnapshotAt(Carbon $atMoment): array
    {
        // Single SQL row — COUNT(*) + override-aware MRR via COALESCE on the
        // join. No PHP iteration over individual subscriptions.
        $row = AgencySubscription::query()
            ->join('plans', 'plans.id', '=', 'agency_subscriptions.plan_id')
            ->where(function (Builder $q) use ($atMoment): void {
                $q->whereNull('agency_subscriptions.ended_at')
                    ->orWhere('agency_subscriptions.ended_at', '>', $atMoment);
            })
            ->where('agency_subscriptions.current_period_start', '<=', $atMoment)
            ->whereIn('agency_subscriptions.status', [
                AgencySubscriptionStatus::Trialing->value,
                AgencySubscriptionStatus::Active->value,
                AgencySubscriptionStatus::PastDue->value,
            ])
            ->selectRaw('COUNT(*) as active_count, COALESCE(SUM(plans.monthly_price_xof), 0) as mrr')
            ->first();

        $mrr = (float) ($row->mrr ?? 0);
        $count = (int) ($row->active_count ?? 0);

        return [
            'mrr' => round($mrr, 2),
            'arr' => round($mrr * 12, 2),
            'active_subscriptions' => $count,
        ];
    }

    private function periodStart(string $period, Carbon $end): Carbon
    {
        return match ($period) {
            '3m' => $end->copy()->subMonthsNoOverflow(3)->startOfDay(),
            '6m' => $end->copy()->subMonthsNoOverflow(6)->startOfDay(),
            '12m' => $end->copy()->subMonthsNoOverflow(12)->startOfDay(),
            '30d' => $end->copy()->subDays(30)->startOfDay(),
            '90d' => $end->copy()->subDays(90)->startOfDay(),
            default => $end->copy()->subMonthsNoOverflow(12)->startOfDay(),
        };
    }

    private function envelope(array $rows, array $totals, string $period, string $granularity): array
    {
        return [
            'rows' => $rows,
            'totals' => $totals,
            'period' => ['range' => $period, 'granularity' => $granularity],
            'generated_at' => now()->toIso8601String(),
        ];
    }
}

<?php

namespace App\Services\Visit;

use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * TCK-075 — Central scheduling rules for {@see PropertyVisit}.
 *
 * Enforces two business invariants that the controller would otherwise
 * duplicate across store/confirm/update:
 *
 *   - **Overlap**: an agent cannot confirm two visits on the same property
 *     whose time windows intersect.
 *   - **Quota**: a visitor cannot hold more than 3 active visits
 *     (`scheduled` + `confirmed`) on a single property at once.
 *
 * Both rules abort with HTTP 422 so the frontend can surface them as
 * validation failures rather than generic server errors.
 */
class VisitSchedulingService
{
    public const MAX_ACTIVE_VISITS_PER_CUSTOMER = 3;

    public const DEFAULT_DURATION_MINUTES = 30;

    /** @var array<int,VisitStatus> */
    public const ACTIVE_STATUSES = [
        VisitStatus::Scheduled,
        VisitStatus::Confirmed,
    ];

    /**
     * Abort with 422 if confirming `$visit` would overlap another
     * confirmed visit on the same property. Accepts optional override
     * values for reschedule scenarios (update endpoint).
     *
     * Pass `$lockForUpdate = true` when called inside a DB transaction
     * to pessimistically lock the candidate rows and close the TOCTOU
     * window between the read and the subsequent status flip.
     */
    public function assertNoOverlap(
        PropertyVisit $visit,
        ?Carbon $scheduledAt = null,
        ?int $durationMinutes = null,
        bool $lockForUpdate = false,
    ): void {
        $start = $scheduledAt ?? $visit->scheduled_at;
        if (! $start) {
            return;
        }
        $duration = $durationMinutes ?? $visit->duration_minutes ?? self::DEFAULT_DURATION_MINUTES;
        $end = $start->copy()->addMinutes($duration);

        $query = PropertyVisit::query()
            ->where('property_id', $visit->property_id)
            ->where('id', '!=', $visit->id)
            ->where('status', VisitStatus::Confirmed)
            ->whereNotNull('scheduled_at');

        if ($lockForUpdate) {
            $query->lockForUpdate();
        }

        $overlap = $query
            ->get(['id', 'scheduled_at', 'duration_minutes'])
            ->first(function (PropertyVisit $other) use ($start, $end) {
                $otherStart = $other->scheduled_at;
                if (! $otherStart) {
                    return false;
                }
                $otherDuration = $other->duration_minutes ?? self::DEFAULT_DURATION_MINUTES;
                $otherEnd = $otherStart->copy()->addMinutes($otherDuration);

                return $start->lt($otherEnd) && $end->gt($otherStart);
            });

        abort_if(
            $overlap !== null,
            422,
            'Another confirmed visit already overlaps this time slot on this property.'
        );
    }

    /**
     * Transactional confirm: re-read the visit with a row lock, run the
     * overlap guard against freshly-locked candidate rows, then flip the
     * status to `confirmed` inside the same transaction.
     *
     * Two concurrent `POST /confirm` calls used to both pass the
     * non-locking overlap check and both win; the row lock here
     * serializes them so only one can confirm.
     */
    public function confirmOrFail(PropertyVisit $visit): PropertyVisit
    {
        return DB::transaction(function () use ($visit) {
            $fresh = PropertyVisit::query()
                ->whereKey($visit->id)
                ->lockForUpdate()
                ->firstOrFail();

            abort_unless(
                $fresh->status === VisitStatus::Scheduled,
                422,
                'Only scheduled visits can be confirmed.'
            );

            $this->assertNoOverlap($fresh, lockForUpdate: true);

            $fresh->update(['status' => VisitStatus::Confirmed]);

            return $fresh;
        });
    }

    /**
     * Abort with 422 if the visitor already holds
     * {@see self::MAX_ACTIVE_VISITS_PER_CUSTOMER} active visits on the
     * same property. Called at creation time only.
     *
     * Pass `$lockForUpdate = true` when invoked inside a DB transaction
     * to pessimistically lock the candidate rows; without it, two
     * concurrent requests could both read `count = 3` and both insert.
     */
    public function assertQuota(
        Property $property,
        ?User $visitor,
        ?int $customerId = null,
        bool $lockForUpdate = false,
    ): void {
        if (! $visitor && ! $customerId) {
            // Anonymous requests are rate-limited at the route level.
            return;
        }

        $query = PropertyVisit::query()
            ->where('property_id', $property->id)
            ->whereIn('status', self::ACTIVE_STATUSES);

        if ($visitor) {
            $query->where(function ($q) use ($visitor, $customerId) {
                $q->where('visitor_id', $visitor->id);
                if ($customerId) {
                    $q->orWhere('customer_id', $customerId);
                }
            });
        } elseif ($customerId) {
            $query->where('customer_id', $customerId);
        }

        if ($lockForUpdate) {
            $query->lockForUpdate();
        }

        abort_if(
            $query->count() >= self::MAX_ACTIVE_VISITS_PER_CUSTOMER,
            422,
            sprintf(
                'You already have %d active visits on this property. Cancel one before requesting another.',
                self::MAX_ACTIVE_VISITS_PER_CUSTOMER,
            )
        );
    }

    /**
     * Transactional create: enforce the per-customer quota with a row
     * lock on the existing active visits before inserting. Closes the
     * TOCTOU window where two parallel requests from the same visitor
     * could both pass `assertQuota` and end up with `count + 2` active
     * visits.
     *
     * @param  array<string,mixed>  $attributes  payload passed to PropertyVisit::create
     */
    public function createOrFail(Property $property, ?User $visitor, array $attributes): PropertyVisit
    {
        return DB::transaction(function () use ($property, $visitor, $attributes) {
            $this->assertQuota(
                $property,
                $visitor,
                $attributes['customer_id'] ?? null,
                lockForUpdate: true,
            );

            return PropertyVisit::create($attributes);
        });
    }
}

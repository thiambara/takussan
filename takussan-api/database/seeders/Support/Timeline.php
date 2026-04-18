<?php

namespace Database\Seeders\Support;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/**
 * Helpers for placing entities along a 13-month timeline. All methods return
 * immutable Carbon instances to make date arithmetic safer in nested loops.
 */
class Timeline
{
    /** Months of historical activity to simulate. */
    public const MONTHS_OF_HISTORY = 13;

    public static function seedStart(): CarbonImmutable
    {
        return CarbonImmutable::now()
            ->startOfDay()
            ->subMonths(self::MONTHS_OF_HISTORY);
    }

    public static function seedEnd(): CarbonImmutable
    {
        return CarbonImmutable::now()->endOfDay();
    }

    public static function randomDateBetween(
        CarbonInterface $from,
        CarbonInterface $to,
    ): CarbonImmutable {
        $fromTs = $from->getTimestamp();
        $toTs = $to->getTimestamp();
        if ($toTs <= $fromTs) {
            return CarbonImmutable::createFromTimestamp($fromTs);
        }
        $ts = random_int($fromTs, $toTs);

        return CarbonImmutable::createFromTimestamp($ts);
    }

    /**
     * Return a date within the seed window with a time jittered between
     * 08:00 and 18:59 local time — useful for simulating business activity.
     */
    public static function businessHour(CarbonInterface $date): CarbonImmutable
    {
        return CarbonImmutable::parse($date)
            ->setTime(random_int(8, 18), random_int(0, 59), random_int(0, 59));
    }

    /**
     * @return iterable<CarbonImmutable> starts of each month in [$from, $to].
     */
    public static function monthlyBuckets(
        CarbonInterface $from,
        CarbonInterface $to,
    ): iterable {
        $cursor = CarbonImmutable::parse($from)->startOfMonth();
        $end = CarbonImmutable::parse($to)->startOfMonth();
        while ($cursor->lessThanOrEqualTo($end)) {
            yield $cursor;
            $cursor = $cursor->addMonth();
        }
    }
}

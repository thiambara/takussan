<?php

namespace App\Services\Media\Cdn;

use Illuminate\Support\Facades\Cache;

class CdnHealthGuard
{
    public const COUNTER_KEY = 'cdn_health_failure_count';

    public const BREAKER_KEY = 'cdn_health_breaker_open';

    /**
     * Returns true when the circuit is open, meaning the CDN should be
     * bypassed and requests should fall back to local storage.
     */
    public function isOpen(): bool
    {
        return (bool) Cache::get(self::BREAKER_KEY, false);
    }

    /**
     * Record a CDN failure.  Once the failure count reaches the configured
     * threshold within the rolling window the circuit breaker opens.
     */
    public function recordFailure(): void
    {
        $threshold = (int) config('cdn.health.threshold', 5);
        $window = (int) config('cdn.health.window', 60);
        $cooldown = (int) config('cdn.health.cooldown', 300);

        $count = (int) Cache::get(self::COUNTER_KEY, 0);
        $count++;

        Cache::put(self::COUNTER_KEY, $count, $window);

        if ($count >= $threshold) {
            Cache::put(self::BREAKER_KEY, true, $cooldown);
        }
    }

    /**
     * Manually reset the circuit breaker (e.g. after CDN recovery).
     */
    public function reset(): void
    {
        Cache::forget(self::COUNTER_KEY);
        Cache::forget(self::BREAKER_KEY);
    }
}

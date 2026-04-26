<?php

namespace App\Services\Notifications\Sms;

use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Contracts\Config\Repository as ConfigRepository;

/**
 * TCK-102 — Orange T&C: hard cap of 3 SMS / day / MSISDN.
 *
 * Counter lives under `sms:orange:cap:{e164}` with a 24h TTL. The router
 * checks {@see hasCapacity()} before each Orange send and bumps via
 * {@see increment()} on success. Hitting the cap triggers a
 * `deferred_to_fallback` (NOT `failed`) so provider error metrics stay
 * accurate.
 */
class OrangeDailyCapTracker
{
    private const TTL_SECONDS = 86400;

    public function __construct(
        private readonly CacheRepository $cache,
        private readonly ConfigRepository $config,
    ) {}

    private function key(string $e164): string
    {
        return "sms:orange:cap:{$e164}";
    }

    public function cap(): int
    {
        return (int) $this->config->get('sms.orange.daily_cap_per_msisdn', 3);
    }

    public function used(string $e164): int
    {
        return (int) ($this->cache->get($this->key($e164)) ?? 0);
    }

    public function hasCapacity(string $e164): bool
    {
        return $this->used($e164) < $this->cap();
    }

    public function increment(string $e164): void
    {
        $key = $this->key($e164);
        // `add` is atomic-create; if the key already exists we fall back
        // to atomic `increment`. Two concurrent calls cannot both land
        // the same value here — the previous read-modify-write pattern
        // could under-count and let the MSISDN exceed Orange's 3/day cap.
        if ($this->cache->add($key, 1, self::TTL_SECONDS)) {
            return;
        }
        $this->cache->increment($key);
    }

    public function reset(string $e164): void
    {
        $this->cache->forget($this->key($e164));
    }
}

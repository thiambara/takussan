<?php

namespace App\Services\Notifications\Sms;

use App\Models\Integration;

/**
 * TCK-102 — Resolve the active Integration row a driver should use for
 * the agency in scope. Drivers call this lazily inside `send()` so
 * runtime toggle of `Integration.is_active` takes effect without
 * redeploy (AC20).
 */
class IntegrationLocator
{
    /** @var array<string,?Integration> agency_id|provider → Integration|null */
    private array $cache = [];

    public function find(?int $agencyId, string $provider): ?Integration
    {
        $key = ($agencyId ?? 'global').'|'.$provider;
        if (array_key_exists($key, $this->cache)) {
            return $this->cache[$key];
        }
        $query = Integration::query()
            ->where('provider', $provider)
            ->where('is_active', true);
        if ($agencyId !== null) {
            $query->where('agency_id', $agencyId);
        } else {
            $query->whereNull('agency_id');
        }

        return $this->cache[$key] = $query->first();
    }

    public function flush(): void
    {
        $this->cache = [];
    }
}

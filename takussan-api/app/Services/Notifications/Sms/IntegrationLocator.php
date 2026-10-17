<?php

namespace App\Services\Notifications\Sms;

use App\Models\Integration;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-102 — Resolve the active Integration row a driver should use for
 * the agency in scope. Drivers call this lazily inside `send()` so
 * runtime toggle of `Integration.is_active` takes effect without
 * redeploy (AC20).
 *
 * TCK-765 (P11.06) — une agence sans intégration propre retombe sur celle
 * de la plateforme (`agency_id` nul) : ADR-0032 met le coût des SMS à la
 * charge de la plateforme. Le cache vit le temps d'une requête ou d'un job :
 * la classe est liée en `scoped()` (AppServiceProvider), et le worker oublie
 * ces instances entre deux jobs.
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
        $found = $agencyId !== null ? $this->query($provider)->where('agency_id', $agencyId)->first() : null;

        return $this->cache[$key] = $found ?? $this->query($provider)->whereNull('agency_id')->first();
    }

    /**
     * @return Builder<Integration>
     */
    private function query(string $provider): Builder
    {
        return Integration::query()
            ->where('provider', $provider)
            ->where('is_active', true);
    }

    public function flush(): void
    {
        $this->cache = [];
    }
}

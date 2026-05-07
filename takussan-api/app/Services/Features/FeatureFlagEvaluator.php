<?php

namespace App\Services\Features;

use App\Domain\Features\Flag;
use App\Models\FeatureFlag;
use App\Models\User;
use Illuminate\Support\Facades\Cache;

class FeatureFlagEvaluator
{
    public function isEnabled(string $key, ?User $user = null): bool
    {
        $catalogue = Flag::tryFrom($key);
        if (! $catalogue) {
            return false;
        }

        if ($user) {
            $override = Cache::get($this->overrideKey($user, $key));
            if ($override !== null) {
                return (bool) $override;
            }
        }

        $stored = FeatureFlag::query()->where('key', $key)->first();
        if (! $stored || ! $stored->enabled) {
            return false;
        }

        $segments = $stored->segments_json ?? [];
        if ($segments === []) {
            return true;
        }

        if (! $user) {
            return false;
        }

        $roles = $segments['roles'] ?? [];
        if (is_array($roles) && $roles !== [] && collect($roles)->intersect($user->getRoleNames())->isNotEmpty()) {
            return true;
        }

        $agencyIds = $segments['agency_ids'] ?? [];
        if (is_array($agencyIds) && $user->agency_id && in_array($user->agency_id, array_map('intval', $agencyIds), true)) {
            return true;
        }

        $percentage = (int) ($segments['rollout_percentage'] ?? 0);
        if ($percentage > 0) {
            return $this->bucket($key, $user->id) < min($percentage, 100);
        }

        return false;
    }

    /**
     * @return array<string,bool>
     */
    public function forUser(User $user, bool $clientVisibleOnly = true): array
    {
        return collect(Flag::cases())
            ->filter(fn (Flag $flag) => ! $clientVisibleOnly || $flag->clientVisible())
            ->mapWithKeys(fn (Flag $flag) => [$flag->value => $this->isEnabled($flag->value, $user)])
            ->all();
    }

    public function setOverride(User $user, string $key, bool $enabled): void
    {
        abort_unless(Flag::tryFrom($key), 404, 'Unknown feature flag.');
        Cache::put($this->overrideKey($user, $key), $enabled, now()->addHour());
    }

    public function bucket(string $key, int $userId): int
    {
        return (int) (hexdec(substr(hash('xxh3', "{$key}:{$userId}"), 0, 8)) % 100);
    }

    private function overrideKey(User $user, string $key): string
    {
        return "feature_flag_override:{$user->id}:{$key}";
    }
}

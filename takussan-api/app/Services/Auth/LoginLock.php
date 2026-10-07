<?php

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Support\Carbon;

/**
 * TCK-589 — verrou par compte après des échecs de connexion répétés (ADR-0033 §6).
 *
 * Partagé par le mot de passe ET le code SMS : 10 échecs consécutifs posent
 * `metadata.locked_at` ; le verrou court 15 min, calculées depuis `locked_at`,
 * pour qu'un tiers qui se trompe exprès ne puisse pas bloquer un compte
 * indéfiniment ; un succès remet `failed_login_attempts` à zéro.
 * `UserSupportService::unlock` (inchangé) efface les deux clés : le geste
 * « Déverrouiller » de la console, qui rendait toujours 409, agit enfin.
 *
 * Le verrou se lit AVANT la vérification du secret : le bon mot de passe n'y
 * échappe pas.
 *
 * Pour un numéro qu'aucun compte n'a vérifié, le même compteur vit en cache sous
 * la clé du numéro : le 423 tombe au même seuil, avec ou sans compte, et ne dit
 * donc rien de l'existence d'un compte.
 */
class LoginLock
{
    public const MAX_FAILURES = 10;

    public const LOCK_MINUTES = 15;

    public function __construct(private readonly CacheRepository $cache) {}

    public function isLocked(User $user): bool
    {
        $lockedAt = $user->metadata['locked_at'] ?? null;

        return is_string($lockedAt) && $this->stillRunning(Carbon::parse($lockedAt));
    }

    public function recordFailure(User $user): void
    {
        $metadata = $user->metadata ?? [];
        $lockedAt = $metadata['locked_at'] ?? null;

        // Un verrou échu ne compte plus : la série repart de zéro.
        if (is_string($lockedAt) && ! $this->stillRunning(Carbon::parse($lockedAt))) {
            unset($metadata['locked_at']);
            $metadata['failed_login_attempts'] = 0;
        }

        $failures = (int) ($metadata['failed_login_attempts'] ?? 0) + 1;
        $metadata['failed_login_attempts'] = $failures;
        if ($failures >= self::MAX_FAILURES && ! isset($metadata['locked_at'])) {
            $metadata['locked_at'] = now()->toIso8601String();
        }

        $user->forceFill(['metadata' => $metadata])->save();
    }

    public function clear(User $user): void
    {
        $metadata = $user->metadata ?? [];
        if (! array_key_exists('locked_at', $metadata) && ! array_key_exists('failed_login_attempts', $metadata)) {
            return;
        }

        unset($metadata['locked_at'], $metadata['failed_login_attempts']);
        $user->forceFill(['metadata' => $metadata])->save();
    }

    // -----------------------------------------------------------------
    // Numéro sans compte vérifié
    // -----------------------------------------------------------------

    public function isNumberLocked(string $phone): bool
    {
        $lockedAt = $this->cache->get($this->numberLockKey($phone));

        return is_int($lockedAt) && $this->stillRunning(Carbon::createFromTimestamp($lockedAt));
    }

    public function recordNumberFailure(string $phone): void
    {
        $key = $this->numberFailuresKey($phone);
        $failures = (int) $this->cache->get($key, 0) + 1;
        $this->cache->put($key, $failures, now()->addMinutes(self::LOCK_MINUTES));

        if ($failures >= self::MAX_FAILURES) {
            $this->cache->put($this->numberLockKey($phone), now()->getTimestamp(), now()->addMinutes(self::LOCK_MINUTES));
            $this->cache->forget($key);
        }
    }

    public function clearNumber(string $phone): void
    {
        $this->cache->forget($this->numberFailuresKey($phone));
        $this->cache->forget($this->numberLockKey($phone));
    }

    private function stillRunning(Carbon $lockedAt): bool
    {
        return $lockedAt->copy()->addMinutes(self::LOCK_MINUTES)->isFuture();
    }

    private function numberFailuresKey(string $phone): string
    {
        return "login-lock-failures:{$phone}";
    }

    private function numberLockKey(string $phone): string
    {
        return "login-lock:{$phone}";
    }
}

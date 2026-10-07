<?php

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Support\Carbon;

/**
 * TCK-589 — verrou après des échecs de connexion répétés (ADR-0033 §6). UN VERROU PAR
 * CANAL (vérification adverse M1) :
 *
 *  - **mot de passe** (et le second facteur saisi derrière lui, ou derrière un rappel
 *    OAuth) : sur le compte. 10 échecs consécutifs posent `metadata.locked_at` ; le
 *    verrou court 15 min depuis `locked_at` ; un succès remet le compteur à zéro.
 *    `UserSupportService::unlock` efface les deux clés.
 *  - **téléphone** : sur le NUMÉRO, en cache, qu'un compte l'ait vérifié ou non — le 423
 *    tombe au même seuil dans les deux cas, et ne dit donc rien de l'existence d'un compte.
 *    Les échecs se comptent dans une fenêtre FIXE de 15 min ouverte par le premier.
 *
 * Avant M1, les deux canaux partageaient le verrou du compte : un tiers qui connaissait le
 * numéro vérifié fermait la porte du mot de passe, à chaque échéance, depuis une IP et sans
 * dépenser un SMS. Le canal téléphone est désormais hors de portée d'un tiers : un code faux
 * ne compte que si un code est en cours (`PhoneLoginService`), et le limiteur
 * `auth-phone-verify` est sous la MOITIÉ du seuil par fenêtre — deux fenêtres de limiteur
 * contiguës peuvent tomber dans une même fenêtre de verrou, leur somme reste sous le seuil.
 *
 * Le verrou se lit AVANT la vérification du secret : le bon mot de passe n'y échappe pas.
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
        // Fenêtre fixe : `add` n'écrit que si la clé manque, `increment` garde son échéance.
        $this->cache->add($key, 0, now()->addMinutes(self::LOCK_MINUTES));
        $failures = (int) $this->cache->increment($key);

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

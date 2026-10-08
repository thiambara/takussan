<?php

namespace App\Services\Lease;

use App\Models\Lease;
use App\Models\User;
use App\Services\Account\DeletionStepUpService;
use Illuminate\Contracts\Cache\Repository as CacheRepository;

/**
 * TCK-596 §4B (ADR-0042 §2) — le code à usage unique d'une signature de bail.
 *
 * Patron {@see DeletionStepUpService} : 6 chiffres en cache, comparaison `hash_equals`, renvoi
 * espacé. Deux écarts :
 *
 *  1. le code est lié au bail, au signataire, au rôle ET à l'empreinte du contrat figé : un code
 *     émis pour un contrat défigé puis refigé ne vaut plus rien ;
 *  2. un compteur d'essais : au 5ᵉ faux, le code est détruit et la signature de ce signataire sur ce
 *     bail est verrouillée 15 min — aucun nouveau code pendant le verrou. Sans lui, 10⁶ codes se
 *     tentent en boucle. Un renvoi ne remet PAS le compteur à zéro (VERIF-596 m1) ; seul un code
 *     juste le fait.
 */
class LeaseSignatureOtpService
{
    public const CODE_TTL_SECONDS = 600;

    public const RESEND_COOLDOWN_SECONDS = 60;

    public const MAX_ATTEMPTS = 5;

    public const LOCK_SECONDS = 900;

    public function __construct(private readonly CacheRepository $cache) {}

    public function isLocked(Lease $lease, User $user, string $role): bool
    {
        return $this->cache->has($this->key('lock', $lease, $user, $role));
    }

    public function canResend(Lease $lease, User $user, string $role): bool
    {
        return ! $this->cache->has($this->key('cooldown', $lease, $user, $role));
    }

    /**
     * Émet un code frais (le précédent meurt) et pose le délai de renvoi. Le canal et la
     * destination masquée voyagent avec le code : ils iront dans la preuve.
     */
    public function issue(Lease $lease, User $user, string $role, string $channel, string $destination): string
    {
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        $this->cache->put($this->key('code', $lease, $user, $role), [
            'code' => $code,
            'sha' => (string) $lease->contract_sha256,
            'channel' => $channel,
            'destination' => $destination,
        ], self::CODE_TTL_SECONDS);
        $this->cache->put($this->key('cooldown', $lease, $user, $role), true, self::RESEND_COOLDOWN_SECONDS);
        // VERIF-596 m1 — le compteur d'essais N'EST PAS remis à zéro par un renvoi : sinon « 4 faux,
        // renvoi, 4 faux… » ne verrouillait jamais. Il compte par signataire, rôle et bail, et vit
        // la durée du verrou.

        return $code;
    }

    /**
     * Vérifie ET consomme : un code juste est détruit (usage unique) et rend `{channel,
     * destination}` ; un code faux est compté et rend `null`. Sous verrou, `null` sans même regarder
     * le code.
     *
     * @return array{channel: string, destination: string}|null
     */
    public function attempt(Lease $lease, User $user, string $role, string $code): ?array
    {
        if ($this->isLocked($lease, $user, $role)) {
            return null;
        }

        $stored = $this->cache->get($this->key('code', $lease, $user, $role));
        $valid = is_array($stored)
            && is_string($stored['code'] ?? null)
            && ($stored['sha'] ?? null) === (string) $lease->contract_sha256
            && hash_equals($stored['code'], trim($code));

        if ($valid) {
            $this->cache->forget($this->key('code', $lease, $user, $role));
            $this->cache->forget($this->key('attempts', $lease, $user, $role));

            return ['channel' => (string) $stored['channel'], 'destination' => (string) $stored['destination']];
        }

        $attemptsKey = $this->key('attempts', $lease, $user, $role);
        $this->cache->add($attemptsKey, 0, self::LOCK_SECONDS);
        $attempts = (int) $this->cache->increment($attemptsKey);
        if ($attempts >= self::MAX_ATTEMPTS) {
            $this->cache->forget($this->key('code', $lease, $user, $role));
            $this->cache->forget($attemptsKey);
            $this->cache->put($this->key('lock', $lease, $user, $role), true, self::LOCK_SECONDS);
        }

        return null;
    }

    private function key(string $kind, Lease $lease, User $user, string $role): string
    {
        return "lease-signature-{$kind}:{$lease->id}:{$user->id}:{$role}";
    }
}

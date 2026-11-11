<?php

namespace App\Services\Signature;

use App\Models\Inventory;
use App\Models\Lease;
use App\Models\User;
use App\Services\Account\DeletionStepUpService;
use Illuminate\Contracts\Cache\Repository as CacheRepository;

/**
 * TCK-596 §4B (ADR-0042 §2) — le code à usage unique d'une signature ; TCK-2646 (ADR-0098 §4) — le
 * même service pour l'état des lieux signé sur place. UN jeu de bornes pour les deux portées :
 * 6 chiffres, 10 min, 60 s avant renvoi, 5 essais faux puis verrou de 15 min.
 *
 * Patron {@see DeletionStepUpService} : 6 chiffres en cache, comparaison `hash_equals`, renvoi
 * espacé. Deux écarts :
 *
 *  1. le code est lié à la portée (un bail ou un état des lieux), au signataire, au rôle ET à
 *     l'empreinte de ce qui se signe ({@see self::fingerprint()}) : un code émis pour un contrat
 *     défigé puis refigé, ou pour un état des lieux modifié depuis, ne vaut plus rien ;
 *  2. un compteur d'essais : au 5ᵉ faux, le code est détruit et la signature de ce signataire sur
 *     cette portée est verrouillée 15 min — aucun nouveau code pendant le verrou. Sans lui, 10⁶
 *     codes se tentent en boucle. Un renvoi ne remet PAS le compteur à zéro (VERIF-596 m1) ; seul
 *     un code juste le fait.
 *
 * Le « signataire » est le titulaire du code : pour l'état des lieux sur place, le LOCATAIRE, jamais
 * le membre du personnel qui tient l'appareil — sinon chaque collègue rouvrirait cinq essais.
 *
 * Les clés du bail sont restées octet pour octet celles d'avant l'extraction
 * (`lease-signature-{kind}:{bail}:{user}:{role}`) : un code en vol au déploiement reste valable.
 */
class SignatureOtpService
{
    public const CODE_TTL_SECONDS = 600;

    public const RESEND_COOLDOWN_SECONDS = 60;

    public const MAX_ATTEMPTS = 5;

    public const LOCK_SECONDS = 900;

    public function __construct(private readonly CacheRepository $cache) {}

    public function isLocked(Lease|Inventory $subject, User $user, string $role): bool
    {
        return $this->cache->has($this->key('lock', $subject, $user, $role));
    }

    public function canResend(Lease|Inventory $subject, User $user, string $role): bool
    {
        return ! $this->cache->has($this->key('cooldown', $subject, $user, $role));
    }

    /**
     * TCK-1337 (P123.06) — un code qui n'est pas parti n'ouvre pas la fenêtre de renvoi : le
     * signataire peut en redemander un aussitôt. Le compteur d'essais n'est pas touché.
     */
    public function releaseResend(Lease|Inventory $subject, User $user, string $role): void
    {
        $this->cache->forget($this->key('cooldown', $subject, $user, $role));
    }

    /**
     * Émet un code frais (le précédent meurt) et pose le délai de renvoi. Le canal et la
     * destination masquée voyagent avec le code : ils iront dans la preuve.
     */
    public function issue(Lease|Inventory $subject, User $user, string $role, string $channel, string $destination): string
    {
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        $this->cache->put($this->key('code', $subject, $user, $role), [
            'code' => $code,
            'sha' => $this->fingerprint($subject),
            'channel' => $channel,
            'destination' => $destination,
        ], self::CODE_TTL_SECONDS);
        $this->cache->put($this->key('cooldown', $subject, $user, $role), true, self::RESEND_COOLDOWN_SECONDS);
        // VERIF-596 m1 — le compteur d'essais N'EST PAS remis à zéro par un renvoi : sinon « 4 faux,
        // renvoi, 4 faux… » ne verrouillait jamais. Il compte par signataire, rôle et portée, et vit
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
    public function attempt(Lease|Inventory $subject, User $user, string $role, string $code): ?array
    {
        if ($this->isLocked($subject, $user, $role)) {
            return null;
        }

        $stored = $this->cache->get($this->key('code', $subject, $user, $role));
        $valid = is_array($stored)
            && is_string($stored['code'] ?? null)
            && ($stored['sha'] ?? null) === $this->fingerprint($subject)
            && hash_equals($stored['code'], trim($code));

        if ($valid) {
            $this->cache->forget($this->key('code', $subject, $user, $role));
            $this->cache->forget($this->key('attempts', $subject, $user, $role));

            return ['channel' => (string) $stored['channel'], 'destination' => (string) $stored['destination']];
        }

        $attemptsKey = $this->key('attempts', $subject, $user, $role);
        $this->cache->add($attemptsKey, 0, self::LOCK_SECONDS);
        $attempts = (int) $this->cache->increment($attemptsKey);
        if ($attempts >= self::MAX_ATTEMPTS) {
            $this->cache->forget($this->key('code', $subject, $user, $role));
            $this->cache->forget($attemptsKey);
            $this->cache->put($this->key('lock', $subject, $user, $role), true, self::LOCK_SECONDS);
        }

        return null;
    }

    /** P72.04 (TCK-1354) — la clé du délai de renvoi, qu'un accusé `failed` du SMS du code lève. */
    public function resendKey(Lease|Inventory $subject, User $user, string $role): string
    {
        return $this->key('cooldown', $subject, $user, $role);
    }

    /**
     * Ce que le code atteste : le contrat figé du bail (`contract_sha256`) ; pour un état des lieux,
     * ce que le locataire a sous les yeux en signant — l'état général, les pièces et leurs éléments,
     * les notes, et les photos de pièces (par identifiant). Un brouillon modifié entre l'envoi et la
     * saisie invalide le code.
     */
    public function fingerprint(Lease|Inventory $subject): string
    {
        if ($subject instanceof Lease) {
            return (string) $subject->contract_sha256;
        }

        return hash('sha256', (string) json_encode([
            'general_condition' => $subject->general_condition?->value,
            'rooms' => $subject->rooms,
            'notes' => $subject->notes,
            'room_photos' => $subject->media()->where('collection_name', 'room_photos')->orderBy('id')->pluck('id')->all(),
        ], JSON_UNESCAPED_UNICODE));
    }

    private function key(string $kind, Lease|Inventory $subject, User $user, string $role): string
    {
        $scope = $subject instanceof Lease ? 'lease' : 'inventory';

        return "{$scope}-signature-{$kind}:{$subject->getKey()}:{$user->id}:{$role}";
    }
}

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
 *    verrou court 15 min depuis `locked_at` ; un succès remet le compteur à zéro. La
 *    série vit 24 h depuis son premier échec (`failed_login_first_at`), comme le leurre
 *    (passe 2, p2-3). `UserSupportService::unlock` efface les trois clés.
 *  - **téléphone** : sur le NUMÉRO, en cache, qu'un compte l'ait vérifié ou non — le 423
 *    tombe au même seuil dans les deux cas, et ne dit donc rien de l'existence d'un compte.
 *    Les échecs se comptent dans une fenêtre FIXE de 15 min ouverte par le premier.
 *  - **e-mail inconnu** (vérification adverse m3) : un compteur LEURRE en cache, par adresse,
 *    au même seuil et avec le même 423 que le compte. Sans lui, `connu@` se verrouillait au
 *    11ᵉ essai et `inconnu@` jamais : le verrou énumérait les adresses inscrites.
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

    /** Passe 2 (p2-3) — durée de vie d'une série d'échecs, depuis son premier : celle du leurre. */
    public const SERIES_HOURS = 24;

    /** Les clés du verrou du mot de passe dans `users.metadata`. */
    public const COUNTER_KEYS = ['locked_at', 'failed_login_attempts', 'failed_login_first_at'];

    public function __construct(private readonly CacheRepository $cache) {}

    public function isLocked(User $user): bool
    {
        $lockedAt = $user->metadata['locked_at'] ?? null;

        return is_string($lockedAt) && $this->stillRunning(Carbon::parse($lockedAt));
    }

    /**
     * P83.04 (TCK-1775) — l'échéance du verrou qui ferme ce compte, tous canaux confondus : celui
     * du mot de passe (`metadata.locked_at`) et celui de son numéro vérifié. `null` : aucun verrou
     * ne court, et une clé `locked_at` échue n'en est plus un. C'est ce que lisent la fiche de la
     * console et `UserSupportService::unlock`, pour juger comme la connexion juge.
     */
    public function lockedUntil(User $user): ?Carbon
    {
        $lockedAt = $user->metadata['locked_at'] ?? null;
        $echeances = [];
        if (is_string($lockedAt) && $this->stillRunning(Carbon::parse($lockedAt))) {
            $echeances[] = Carbon::parse($lockedAt)->addMinutes(self::LOCK_MINUTES);
        }

        $numero = $user->phone_verified_at !== null && $user->phone ? (string) $user->phone : null;
        $numeroVerrouilleA = $numero !== null ? $this->cache->get($this->numberLockKey($numero)) : null;
        if (is_int($numeroVerrouilleA) && $this->stillRunning(Carbon::createFromTimestamp($numeroVerrouilleA))) {
            $echeances[] = Carbon::createFromTimestamp($numeroVerrouilleA)->addMinutes(self::LOCK_MINUTES);
        }

        return $echeances === [] ? null : max($echeances);
    }

    /**
     * P245.02 (TCK-2367) — la règle se joue en base, en une instruction, sur la `metadata` de la
     * ligne ({@see MetadataDuCompte}) : recomposée depuis le compte chargé, elle comptait 1 pour deux
     * échecs croisés, et effaçait le drapeau d'une réinitialisation de la 2FA écrite entre-temps.
     * Chaque étape porte le nom de celle qu'elle remplace.
     */
    public function recordFailure(User $user): void
    {
        $now = now();
        $colonne = MetadataDuCompte::COLONNE;
        // `isset()` : la clé est là, et n'est pas `null`.
        $echuVerrouille = "COALESCE(jsonb_typeof(echu.m->'locked_at'), 'null') <> 'null'";
        $premierPose = "COALESCE(jsonb_typeof(serie.m->'failed_login_first_at'), 'null') <> 'null'";
        $premierVerrouille = "COALESCE(jsonb_typeof(premier.m->'locked_at'), 'null') <> 'null'";

        MetadataDuCompte::ecrire($user, <<<SQL
            (SELECT CASE WHEN echec.nombre >= ? AND NOT echec.verrouille
                         THEN jsonb_set(echec.m, '{locked_at}', to_jsonb(?::text))
                         ELSE echec.m END
               FROM (SELECT {$colonne} AS m) lue
              -- Un verrou échu ne compte plus : la série repart de zéro.
              CROSS JOIN LATERAL (SELECT CASE
                    WHEN jsonb_typeof(lue.m->'locked_at') = 'string' AND (lue.m->>'locked_at')::timestamptz <= ?::timestamptz
                    THEN (lue.m - 'locked_at' - 'failed_login_first_at') || '{"failed_login_attempts": 0}'::jsonb
                    ELSE lue.m END AS m) echu
              -- Passe 2 (p2-3) — une série vit 24 h depuis son premier échec, comme le leurre.
              CROSS JOIN LATERAL (SELECT CASE
                    WHEN NOT ({$echuVerrouille}) AND jsonb_typeof(echu.m->'failed_login_first_at') = 'string'
                         AND (echu.m->>'failed_login_first_at')::timestamptz < ?::timestamptz
                    THEN (echu.m - 'failed_login_first_at') || '{"failed_login_attempts": 0}'::jsonb
                    ELSE echu.m END AS m) serie
              CROSS JOIN LATERAL (SELECT CASE
                    WHEN {$premierPose} THEN serie.m
                    ELSE jsonb_set(serie.m, '{failed_login_first_at}', to_jsonb(?::text)) END AS m) premier
              CROSS JOIN LATERAL (SELECT COALESCE((premier.m->>'failed_login_attempts')::int, 0) + 1 AS nombre,
                                         {$premierVerrouille} AS verrouille) compte
              CROSS JOIN LATERAL (SELECT jsonb_set(premier.m, '{failed_login_attempts}', to_jsonb(compte.nombre)) AS m,
                                         compte.nombre, compte.verrouille) echec)
            SQL, [
            self::MAX_FAILURES,
            $now->toIso8601String(),
            $now->copy()->subMinutes(self::LOCK_MINUTES)->toIso8601String(),
            $now->copy()->subHours(self::SERIES_HOURS)->toIso8601String(),
            $now->toIso8601String(),
        ]);
    }

    /** Un succès remet le compteur à zéro — sur la ligne en base, comme l'échec (P245.02). */
    public function clear(User $user): void
    {
        MetadataDuCompte::retirer($user, self::COUNTER_KEYS);
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

    // -----------------------------------------------------------------
    // E-mail sans compte — le leurre (vérification adverse m3)
    // -----------------------------------------------------------------

    public function isUnknownEmailLocked(string $email): bool
    {
        $lockedAt = $this->cache->get($this->emailLockKey($email));

        return is_int($lockedAt) && $this->stillRunning(Carbon::createFromTimestamp($lockedAt));
    }

    /**
     * Comme le compteur d'un compte : des échecs CONSÉCUTIFS, dans une série qui vit 24 h depuis
     * son premier échec (l'échéance de la clé, qu'`increment` garde), remis à zéro quand le
     * verrou tombe. Le compte a la même fenêtre depuis la passe 2 (p2-3).
     */
    public function recordUnknownEmailFailure(string $email): void
    {
        $key = $this->emailFailuresKey($email);
        $this->cache->add($key, 0, now()->addHours(self::SERIES_HOURS));
        $failures = (int) $this->cache->increment($key);

        if ($failures >= self::MAX_FAILURES) {
            $this->cache->put($this->emailLockKey($email), now()->getTimestamp(), now()->addMinutes(self::LOCK_MINUTES));
            $this->cache->forget($key);
        }
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

    private function emailFailuresKey(string $email): string
    {
        return 'login-lock-failures:email:'.hash('sha256', $email);
    }

    private function emailLockKey(string $email): string
    {
        return 'login-lock:email:'.hash('sha256', $email);
    }
}

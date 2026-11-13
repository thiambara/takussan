<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * TCK-2768 — la FORME d'une date reçue qui désigne un JOUR (colonne `date`, ou borne lue au jour) :
 * `AAAA-MM-JJ` exactement, jour qui existe, année bornée. Posée avec `date`, ou avec `date_format:Y-m-d` (r1 de la
 * vérification de 7981e617d : ce format admet l'an 1 et 9999) ; la garde
 * `InstantRecuConvertiTest::test_aucune_date_recue_n_est_nue` exige elle ou {@see InstantIso} sur chaque `date`, et
 * elle seule sur chaque `date_format:Y-m-d`.
 *
 * La règle `date` de Laravel relit de travers « 99999-01-01 » (2009-01-01), « 10000-01-01 » (2000-01-01),
 * « 12/11/2026 » (le 11 décembre), « 2026-W46 », « 1 Nov 2026 ». `date_format:Y-m-d` seul les refuse, mais
 * admet encore « 0099-01-01 » (mesuré le 2026-11-13 par `DateTime::createFromFormat('!Y-m-d')`, comme
 * `validateDateFormat`) : d'où la borne d'années.
 *
 * Le plancher est celui d'{@see InstantIso} (avant 1970, aucun écran n'écrit de jour). Le plafond est PROPRE
 * au jour : 2199, décision du porteur du 2026-11-13 (TCK-2768, option b, plancher 1970) — aucune règle ne
 * borne la durée d'un bail, et un bail emphytéotique (jusqu'à 99 ans) signé en 2026 finit après 2100. Changer
 * le plafond, c'est changer cette constante et son miroir du front (`ANNEE_MAX_DE_L_API`), que lie un test.
 *
 * `null` n'est pas jugé ici (`nullable` en répond) ; toute autre valeur qui n'est pas une chaîne est refusée.
 */
class JourIso implements ValidationRule
{
    public const ANNEE_MIN = InstantIso::ANNEE_MIN;

    public const ANNEE_MAX = 2199;

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if ($value === null) {
            return;
        }

        if (! is_string($value) || ! self::estAdmis($value)) {
            $fail('validation.rules.jour')->translate(['min' => (string) self::ANNEE_MIN, 'max' => (string) self::ANNEE_MAX]);
        }
    }

    public static function estAdmis(string $valeur): bool
    {
        if (preg_match('/\A(\d{4})-(\d{2})-(\d{2})\z/', $valeur, $m) !== 1) {
            return false;
        }

        $annee = (int) $m[1];

        return $annee >= self::ANNEE_MIN && $annee <= self::ANNEE_MAX && checkdate((int) $m[2], (int) $m[3], $annee);
    }
}

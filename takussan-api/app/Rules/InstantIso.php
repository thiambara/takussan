<?php

namespace App\Rules;

use App\Support\InstantRecu;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * TCK-2752 — la FORME d'une date-heure reçue : ISO 8601 strict, années bornées. Posée avec `date` sur
 * chaque champ que la garde de TCK-2743 relève (`InstantRecuConvertiTest`), et que {@see InstantRecu}
 * convertit ensuite.
 *
 * La règle `date` de Laravel (`strtotime()` puis `date_parse()`) laisse passer des formes qu'elle
 * relit de travers, mesurées le 2026-11-13 : « 99999-01-01 » relu 2009-01-01, « 10000-01-01 » relu
 * 2000-01-01 10:00, « 0099-01-01 » relu l'an 99, « 12/11/2026 » relu le 11 décembre, et un octet nul
 * intérieur ignoré — « 2026-11-12T10:00\0+05:00 », qui traverse `TrimStrings`, devient 05:00 UTC.
 *
 * Admis — tout ce que le front, les tests et les clients envoient aujourd'hui :
 *
 * - une date seule, `AAAA-MM-JJ` (fins inclusives de `FinInclusive::de()`, `paid_at`, `received_at`…) ;
 * - suivie de `T` OU d'une espace (RFC 3339 §5.6 ; la fin d'absence du front l'envoie, `… 23:59:59`),
 *   puis `HH:MM`, `HH:MM:SS`, `HH:MM:SS.f` (1 à 6 chiffres : `toISOString()` en écrit 3, Carbon 6) ;
 * - puis, facultatif, `Z`, `±HH:MM` ou `±HHMM` (décalage d'au plus 14 h). Sans décalage, l'heure se lit
 *   à Dakar ({@see InstantRecu::FUSEAU_SANS_DECALAGE}).
 *
 * Refusé : tout le reste — forme compacte, semaine ISO, minuscules, heure sans minutes, heure 24,
 * seconde 60, jour inexistant, et les années hors de [{@see self::ANNEE_MIN}, {@see self::ANNEE_MAX}].
 * Avant 1941, Dakar n'était pas à UTC+0 (LMT −1:09:44, puis −1:00) : une date seule s'y relirait à une
 * heure décalée. Aucun écran ni aucun test n'envoie une année hors de la plage.
 *
 * `null` n'est pas jugé ici (`nullable` en répond) ; toute autre valeur qui n'est pas une chaîne est
 * refusée.
 */
class InstantIso implements ValidationRule
{
    public const ANNEE_MIN = 1970;

    public const ANNEE_MAX = 2100;

    private const FORME = '/\A(\d{4})-(\d{2})-(\d{2})'
        .'(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?'
        .'(?:Z|[+-](\d{2}):?(\d{2}))?)?\z/';

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if ($value === null) {
            return;
        }

        if (! is_string($value) || ! self::estAdmise($value)) {
            $fail('validation.rules.instant')->translate();
        }
    }

    public static function estAdmise(string $valeur): bool
    {
        if (preg_match(self::FORME, $valeur, $m) !== 1) {
            return false;
        }

        $annee = (int) $m[1];
        if ($annee < self::ANNEE_MIN || $annee > self::ANNEE_MAX || ! checkdate((int) $m[2], (int) $m[3], $annee)) {
            return false;
        }

        $heure = $m[4] ?? '';
        if ($heure !== '' && ((int) $heure > 23 || (int) $m[5] > 59 || (int) ($m[6] ?? 0) > 59)) {
            return false;
        }

        $decalage = $m[7] ?? '';

        return $decalage === '' || ((int) $m[8] <= 59 && (int) $decalage * 60 + (int) $m[8] <= 14 * 60);
    }
}

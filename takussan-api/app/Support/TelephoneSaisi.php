<?php

namespace App\Support;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * TCK-590 — un numéro tel qu'un visiteur le TAPE, ramené à la forme E.164 que le SMS exige.
 *
 * Relevé par TCK-588 : un visiteur qui saisissait « 77 123 45 67 » ne recevait jamais son rappel
 * de visite — le numéro était enregistré tel quel, et seul l'agent était prévenu. Au Sénégal, on
 * donne son numéro au format national : le refuser renvoyait le défaut au visiteur, l'accepter
 * sans le normaliser le rendait injoignable. On le normalise, puis `TelephoneJoignable` juge.
 *
 *   `+221 77 123-45.67` → `+221771234567`   séparateurs de saisie retirés
 *   `77 123 45 67`      → `+221771234567`   mobile sénégalais au format national (70, 75-78)
 *   `33 820 12 34`      → `+221338201234`   fixe sénégalais (33)
 *   `00221771234567`    → `+221771234567`   préfixe international `00`
 *   `221771234567`      → `+221771234567`   indicatif sans `+`
 *
 * Rien d'autre n'est deviné : un numéro qui ne prend aucune de ces formes reste tel quel, et la
 * règle le refuse. `customers.phone` n'est PAS concerné (TCK-591).
 *
 * Vérification adverse, passe 1b :
 *
 *   · **m6** — « +77 123 45 67 » ou « 00 77 123 45 67 » devenaient `+771234567` : un « +7 » à neuf
 *     chiffres, qui a la forme E.164 et ne sera jamais délivré. Comme règle de validation, cette
 *     classe REFUSE (422) un `+` suivi d'un numéro national sénégalais nu — elle n'en fabrique pas
 *     un numéro international. Aucun numéro réel n'a cette forme : la zone +7 et la France (+33)
 *     comptent dix et neuf chiffres nationaux, pas sept.
 *   · **m7** — le fixe (33) est un numéro de CONTACT valable, et ne reçoit pas de SMS :
 *     {@see self::recoitLesSms()}.
 */
final class TelephoneSaisi implements ValidationRule
{
    /** Un `+` devant un numéro national sénégalais nu : l'indicatif manque, il n'est pas « +7 ». */
    private const INDICATIF_MANQUANT = '/^\+(?:7[05678]|33)\d{7}$/';

    /** Mobile (70, 75, 76, 77, 78) ou fixe (33) sénégalais : 9 chiffres, sans indicatif. */
    public const NATIONAL_SENEGAL = '/^(?:7[05678]|33)\d{7}$/';

    public static function normaliser(mixed $value): mixed
    {
        if (! is_string($value)) {
            return $value;
        }

        $numero = preg_replace('/[\s.\-()\/]+/u', '', $value) ?? $value;

        if (str_starts_with($numero, '00')) {
            $numero = '+'.substr($numero, 2);
        }
        if (preg_match('/^221\d{9}$/', $numero) === 1) {
            return '+'.$numero;
        }
        if (preg_match(self::NATIONAL_SENEGAL, $numero) === 1) {
            return '+221'.$numero;
        }

        return $numero;
    }

    /**
     * Ce numéro (normalisé) peut-il recevoir un SMS ? Un fixe sénégalais, non. Hors du Sénégal,
     * rien ne permet d'en juger ici : on laisse l'opérateur trancher.
     */
    public static function recoitLesSms(?string $numero): bool
    {
        if ($numero === null || $numero === '') {
            return false;
        }

        return ! str_starts_with($numero, '+221') || preg_match('/^\+2217[05678]\d{7}$/', $numero) === 1;
    }

    /** Appliquée APRÈS {@see self::normaliser()} (dans `prepareForValidation`). */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (is_string($value) && preg_match(self::INDICATIF_MANQUANT, $value) === 1) {
            $fail(__('leads.phone_country_code'));
        }
    }
}

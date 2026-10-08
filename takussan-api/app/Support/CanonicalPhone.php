<?php

namespace App\Support;

use InvalidArgumentException;

/**
 * TCK-589, vérification adverse m5 — la forme CANONIQUE d'un numéro enregistré, écrite une
 * fois, côté base et côté PHP, sur le patron de {@see CaseInsensitive}.
 *
 * Des numéros ont été enregistrés, et VÉRIFIÉS, hors E.164 : la forme corrompue
 * `780143710+221` de TCK-566 (relevée sur une base déployée, cf.
 * `ResendPhoneVerificationRequest`). Comparés en chaîne brute, ils échappaient à
 * l'entrée par téléphone (le titulaire obtenait un SECOND compte) et à l'index d'unicité.
 *
 * La réparation, dans cet ordre :
 *   1. espaces, parenthèses, points et tirets retirés ;
 *   2. `00` en tête → `+` ;
 *   3. l'indicatif tapé APRÈS le numéro (`780143710+221`) → remis devant ;
 *   4. douze chiffres commençant par `221` → `+221…` ;
 *   5. neuf chiffres nus → `+221…` (l'indicatif de la plateforme).
 * Un numéro déjà en E.164 en sort inchangé. Le `0` de préfixe national (`+33 06…`,
 * TCK-574) n'est PAS réparé : aucun SMS n'y arrive, aucun ne s'y est donc vérifié.
 *
 * `sql()` et `fold()` vont PAR PAIRE, et `sql('phone')` est, au caractère près,
 * l'expression de l'index `users_phone_verified_unique` (migration `150200`) : une
 * requête qui l'écrit autrement ne l'emprunte pas (`CanonicalPhoneTest` le vérifie).
 */
final class CanonicalPhone
{
    public static function sql(string $colonne): string
    {
        if (preg_match('/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i', $colonne) !== 1) {
            throw new InvalidArgumentException("Identifiant de colonne invalide : {$colonne}");
        }

        return "regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace({$colonne}, "
            ."'[[:space:]().-]', '', 'g'), '^00', '+'), '^([0-9]+)\\+([0-9]{1,3})\$', '+\\2\\1'), "
            ."'^(221[0-9]{9})\$', '+\\1'), '^([0-9]{9})\$', '+221\\1')";
    }

    public static function fold(string $valeur): string
    {
        $valeur = (string) preg_replace('/[ \t\n\x0B\f\r().-]/', '', $valeur);
        $valeur = (string) preg_replace('/^00/', '+', $valeur);
        $valeur = (string) preg_replace('/^([0-9]+)\+([0-9]{1,3})$/', '+$2$1', $valeur);
        $valeur = (string) preg_replace('/^(221[0-9]{9})$/', '+$1', $valeur);

        return (string) preg_replace('/^([0-9]{9})$/', '+221$1', $valeur);
    }
}

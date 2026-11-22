<?php

namespace App\Support;

/**
 * TCK-2672 — des coordonnées dans un texte libre : un numéro sénégalais (mobile 70/75/76/77/78 ou
 * fixe 30/33, avec ou sans `+221` / `00221`, groupé par espaces, points ou tirets), une adresse
 * e-mail, une URL. UNE définition, lue deux fois : le risque d'un avis (`ReviewRiskClassifier`,
 * filtré et compté en SQL) et la liste de contrôle d'un bien à valider (`description_has_contact`).
 *
 * Les motifs sont écrits pour être compris À L'IDENTIQUE par PCRE (`preg_match`, drapeau `i`) et
 * par les expressions régulières avancées de PostgreSQL (`~*`) : classes explicites (`[0-9]`,
 * `[[:space:]]`), pas de `\b` (un retour arrière sous PostgreSQL), bornes écrites
 * `(^|[^0-9])`. `ContactDetailsParityTest` passe chaque exemple par les deux moteurs.
 *
 * Un prix n'est pas un numéro : un groupe de neuf chiffres suivi d'une devise (`F`, `FCFA`, `CFA`,
 * `XOF`, `francs`) ne compte pas — « 780 000 000 FCFA » a la forme d'un mobile.
 */
final class ContactDetails
{
    public const PHONE = '(^|[^0-9])((\+|00)[[:space:].-]*221[[:space:].-]*)?(7[05678]|3[03])([[:space:].-]*[0-9]){7}(?![[:space:]]*(fcfa|f[[:space:]]*cfa|cfa|xof|francs?|f)([^a-z]|$))([^0-9]|$)';

    public const EMAIL = '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}';

    public const URL = '(https?://|www\.)[^[:space:]]+|(^|[^a-z0-9@._-])[a-z0-9-]+\.(com|sn|net|org|fr|io|co|info|biz|me)([^a-z0-9]|$)';

    /** @var list<string> */
    public const PATTERNS = [self::PHONE, self::EMAIL, self::URL];

    public static function found(?string $text): bool
    {
        if ($text === null || trim($text) === '') {
            return false;
        }

        foreach (self::PATTERNS as $pattern) {
            if (preg_match('~'.$pattern.'~iu', $text) === 1) {
                return true;
            }
        }

        return false;
    }

    /**
     * La même règle en SQL (PostgreSQL) : `[$sql, $bindings]`, vrai quand l'expression porte des
     * coordonnées. `$expression` est une expression SQL de confiance (colonnes), jamais une saisie.
     *
     * @return array{0: string, 1: list<string>}
     */
    public static function sql(string $expression): array
    {
        $parts = array_map(fn () => "({$expression}) ~* ?", self::PATTERNS);

        return ['('.implode(' OR ', $parts).')', self::PATTERNS];
    }
}

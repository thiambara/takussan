<?php

namespace App\Support;

use InvalidArgumentException;

/**
 * La FORME du repli de casse, écrite une fois
 * ([ADR-0025](../../../docs/adr/0025-repli-de-casse-par-collation-icu.md)).
 *
 * ─── Pourquoi une classe pour deux mots de SQL ─────────────────────────────────────
 *
 * Parce que ces deux mots doivent être IDENTIQUES à ceux de l'index, sans quoi la
 * requête ne l'emprunte pas. Mesuré sur 5000 lignes, index
 * `LOWER(name COLLATE "und-x-icu")` en place :
 *
 *     WHERE LOWER(name COLLATE "und-x-icu") = ?   →  Index Scan
 *     WHERE LOWER(name) = ?                       →  Seq Scan
 *
 * Une chaîne recopiée à six endroits diverge au septième, et la divergence ne rougit
 * nulle part : elle rend le même RÉSULTAT, plus lentement. *Un défaut qui ne change que
 * le plan d'exécution n'a aucun symptôme jusqu'à ce qu'il en ait un très gros.*
 *
 * ─── `sql()` et `fold()` vont PAR PAIRE ────────────────────────────────────────────
 *
 * Les deux côtés de la comparaison doivent replier de la même façon. `strtolower()` de
 * PHP est ASCII-only, exactement comme `lower()` sous `--locale=C` :
 * `strtolower('CAFÉ')` rend `cafÉ`. Comparer un `mb_strtolower` PHP à un `lower()` SQL
 * nu — ou l'inverse — reproduit le défaut d'ADR-0025 d'un côté ou de l'autre.
 *
 *     ✓ ->whereRaw(CaseInsensitive::sql('email').' = ?', [CaseInsensitive::fold($email)])
 *     ✗ ->whereRaw('LOWER(email) = ?', [strtolower($email)])
 *
 * ⚠ **Ce n'est PAS un repli d'accents.** `Café` et `Cafe` restent distincts, des deux
 * côtés — reconduction délibérée d'ADR-0020 §2, qui refuse d'installer `unaccent` sans
 * un ticket qui le porte. Vérifié : `lower('CAFÉ' COLLATE "und-x-icu") = 'cafe'` → `f`.
 */
final class CaseInsensitive
{
    /**
     * La locale RACINE, et pas une locale de pays.
     *
     * Le repli de casse est localisé : mesuré, `lower('ISTANBUL' COLLATE "tr-x-icu")`
     * rend `ıstanbul`, avec un i sans point. Choisir une locale nationale ferait
     * dépendre l'unicité d'une table de la langue supposée de ses données.
     *
     * Elle est DÉTERMINISTE (`collisdeterministic` → `t`), donc `LIKE` reste possible
     * sur l'expression : c'est la contrainte dure posée par ADR-0020.
     */
    public const COLLATION = 'und-x-icu';

    /**
     * L'expression SQL à comparer — celle des index, au caractère près.
     *
     * @param  string  $colonne  identifiant de colonne, éventuellement qualifié (`users.email`)
     */
    public static function sql(string $colonne): string
    {
        // Cette valeur part dans du SQL brut. Les appelants ne passent que des
        // littéraux, et c'est précisément pour que ça reste vrai que le contrôle est
        // ici : *une garantie qui repose sur la discipline des appelants n'est pas une
        // garantie, c'est un espoir.*
        if (preg_match('/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i', $colonne) !== 1) {
            throw new InvalidArgumentException("Identifiant de colonne invalide : {$colonne}");
        }

        return sprintf('LOWER(%s COLLATE "%s")', $colonne, self::COLLATION);
    }

    /**
     * Le repli côté PHP — le pendant de {@see self::sql()}.
     *
     * `mb_strtolower`, jamais `strtolower` : le second est ASCII-only et reproduirait,
     * côté application, le défaut exact qu'ADR-0025 corrige côté base.
     */
    public static function fold(string $valeur): string
    {
        return mb_strtolower($valeur);
    }
}

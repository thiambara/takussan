<?php

namespace App\Support\Http;

use Illuminate\Http\Request;

/**
 * ADR-0075 (P216.05, TCK-2242) — le seul lecteur d'un paramètre de requête qui attend une valeur
 * unique. Reçue en liste (`sort[]=x`, `include[]=x`, `filter[status][]=x`), la valeur vaut absente :
 * la route la traite comme si elle manquait, au lieu de la caster et de rendre 500 « Array to string
 * conversion ».
 *
 * Le lecteur ne fait rien d'autre : le défaut, le `trim()` et le découpage sur la virgule restent à
 * l'appelant. Une chaîne vide arrive déjà `null` (`ConvertEmptyStringsToNull`). Les refus en place
 * (400, 422, « aucune ligne » des filtres des tâches, ADR-0075 § 2) restent à leur route.
 */
final class ParametreUnique
{
    /** La clé, en notation pointée (`filter.status`) : sa chaîne, ou `null` si absente ou en liste. */
    public static function chaine(Request $request, string $cle): ?string
    {
        return self::valeur($request->input($cle));
    }

    /**
     * La même règle pour une valeur déjà extraite : le `$value` d'un `AllowedFilter::callback`, ou
     * un élément de `$request->input('filter', [])`. Un scalaire d'un corps JSON se lit en chaîne,
     * comme le faisait le `(string)` des sites migrés.
     */
    public static function valeur(mixed $valeur): ?string
    {
        return is_scalar($valeur) ? (string) $valeur : null;
    }
}

<?php

namespace App\Services\Search\Query;

/**
 * TCK-2473 (ADR-0088) — les lieux que l'analyse de la saisie reconnaît. Injecté dans {@see SearchQueryParser}, qui
 * reste ainsi sans base ni réseau.
 *
 * Implémentation par défaut : {@see DatabasePlaceLexicon} (le référentiel géographique). TCK-2474 et TCK-2476 y
 * ajouteront les variantes d'écriture (alias) ; en mémoire : {@see InMemoryPlaceLexicon}.
 */
interface PlaceLexicon
{
    /**
     * Le plus long lieu connu au DÉBUT de `$words`.
     *
     * `$words` : les mots de la saisie à partir d'une position, dans l'ordre (le parseur les passe repliés, sans
     * accents ni casse, mais une implémentation les replie elle-même). `length` : le nombre de mots de `$words`
     * consommés. `city` : la ville d'un quartier, `null` pour une ville ou pour un quartier dont le nom existe dans
     * plusieurs villes.
     *
     * @param  list<string>  $words
     * @return array{kind: 'city'|'neighborhood', name: string, city: ?string, length: int}|null
     */
    public function longestMatch(array $words): ?array;
}

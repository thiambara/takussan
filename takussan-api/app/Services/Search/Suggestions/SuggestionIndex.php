<?php

namespace App\Services\Search\Suggestions;

/**
 * TCK-2474 (ADR-0088) — l'index Meilisearch des suggestions : son nom et ses réglages, lus par celui qui le construit
 * ({@see SuggestionIndexBuilder}) et par celui qui l'interroge ({@see SearchSuggestions}).
 *
 * Un document par entrée : `{id, kind, label_fr, label_en, label_wo, aliases[], value, city, criteria, weight, count}`.
 * - `kind` : `city` | `neighborhood` | `property_type` | `query` (recherche populaire) | `alias` (variante, TCK-2476).
 * - `criteria` : les paramètres de la liste publique que l'entrée désigne (`{city}`, `{city, location}`, `{type}`, ceux
 *   d'une recherche populaire) — le front construit son lien avec, sans rien deviner.
 * - `count` : le total que la liste publique rendait sous ces critères AU MOMENT DE LA CONSTRUCTION (même filtre, même
 *   traduction des critères : `PropertySearchService::nominalQuery()`). Il a donc au plus une heure de retard.
 * - `weight` : le rang. Le nombre de biens pour un lieu ou un type ; la popularité (visiteurs-jours du journal,
 *   `SearchJournal::popular()`) pour une recherche populaire.
 *
 * ⚠ Pas un index de modèle Scout : il n'est ni dans `config/scout.php` (le déclarer y changerait l'empreinte
 * `.search-shape` et réimporterait TOUS les modèles au déploiement suivant), ni dans `search:sync-index-settings`.
 * Ses réglages sont posés par le constructeur, sur chaque index neuf, avant qu'il soit servi.
 *
 * Préfixé comme les index de Scout (`scout.prefix`) : le harnais de tests l'isole par processus et le supprime en fin
 * d'exécution avec les autres (`Tests\Support\TestSearchIndex`, qui balaie tout ce qui porte le préfixe).
 */
final class SuggestionIndex
{
    public const NAME = 'search_suggestions';

    /** Le marqueur des index en construction : `<uid>_build_<aléa>`. */
    public const BUILD_MARKER = '_build_';

    public const KIND_CITY = 'city';

    public const KIND_NEIGHBORHOOD = 'neighborhood';

    public const KIND_PROPERTY_TYPE = 'property_type';

    public const KIND_QUERY = 'query';

    public const KIND_ALIAS = 'alias';

    public static function uid(): string
    {
        return config('scout.prefix', '').self::NAME;
    }

    /**
     * Réglages de l'index — ceux que le ticket prescrit.
     *
     * `minWordSizeForTypos.oneTypo = 4` : `dakr` atteint `Dakar` (une faute dès 4 caractères), ce que l'index des
     * biens, resté aux défauts du moteur (5), ne fait pas. `weight:desc` APRÈS `exactness` : la pertinence textuelle
     * décide d'abord, le poids départage — « Mermoz » exact devance « Mermoz Sacré-Cœur » plus peuplé.
     *
     * @return array<string, mixed>
     */
    public static function settings(): array
    {
        return [
            'searchableAttributes' => ['label_fr', 'label_en', 'label_wo', 'aliases'],
            'filterableAttributes' => ['kind'],
            'sortableAttributes' => ['weight'],
            'typoTolerance' => ['minWordSizeForTypos' => ['oneTypo' => 4, 'twoTypos' => 8]],
            'rankingRules' => ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness', 'weight:desc'],
        ];
    }
}

<?php

return [
    /*
    | TCK-2603 (ADR-0088, amendement du 2026-11-10, cinquième sortie) — le départ de la publication dit combien de
    | recherches des 7 derniers jours visent la ville du propriétaire, lu dans le journal anonyme des recherches
    | (`search_query_stats`). Lu par `App\Services\Search\DemandeDePublication`, et nulle part ailleurs.
    |
    | - `demand_min_searches` : sous ce total, rien ne sort (valeur décidée par le porteur le 2026-11-10). Un total de
    |   ville au-dessus de 200 ne dit rien d'une personne ni d'une recherche.
    | - `demand_default_city` : la ville que la réponse nomme quand l'appelant n'en donne pas et que le journal ne
    |   rapproche aucune recherche d'une ville du référentiel — sans chiffre.
    */
    'demand_min_searches' => 200,
    'demand_default_city' => 'Dakar',
];

<?php

/*
 * La recherche publique des biens.
 */
return [

    /*
     * TCK-2472 (ADR-0088) — le journal anonyme et agrégé des recherches (`App\Services\Search\SearchJournal`).
     *
     * `min_visitors` : une recherche n'est proposée (`popular()`) qu'après ce nombre de visiteurs distincts un même jour
     * (ADR-0088 §4). `retention_months` : âge au-delà duquel `search:purge-journal` efface une ligne (ADR-0088 §5) —
     * `privacy.ts` § 6 dit 13 mois : changer l'un, c'est changer l'autre (et `VERSION_DOCUMENTS`), dans la même PR.
     * L'empreinte du jour d'un visiteur, elle, n'est pas réglable : 48 heures, comme la politique le promet.
     */
    'journal' => [
        'min_visitors' => 5,
        'retention_months' => 13,
    ],
];

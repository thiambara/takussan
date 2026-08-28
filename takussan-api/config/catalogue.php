<?php

/**
 * Réglages du CATALOGUE PUBLIC — TCK-433 (passe 2).
 *
 * ⚠️ **Aucune clé ne lit `env()`, et c'est délibéré.** Ce sont des décisions de PRODUIT, pas
 * d'environnement : elles doivent valoir la même chose en développement, en préversion et en
 * production, et une divergence entre les deux `.env` n'aurait ici aucun sens. C'est aussi ce qui
 * les garde hors du périmètre de `scripts/check-env-parity.mjs`, qui compare des clés
 * d'environnement.
 */
return [

    /*
    |--------------------------------------------------------------------------
    | Plafond du domaine des villes
    |--------------------------------------------------------------------------
    |
    | Nombre maximum de villes rendues par `GET /api/public/properties/cities`.
    |
    | Ce n'est PAS une pagination : la réponse est un DOMAINE, et un domaine se rend entier ou pas
    | du tout. Le plafond garde contre une base polluée (une ville par annonce) — au-delà, la
    | réponse le DIT (`meta.truncated`), et le front replie alors TOUTE facette de ville sur la
    | page nue plutôt que de rejeter en silence les villes qui n'ont pas tenu.
    |
    | ⚠ Il est ici, et non figé dans le contrôleur, pour que son BORD soit éprouvable : un test qui
    | l'abaisse à 2 mesure la troncature avec trois biens, là où l'éprouver à 500 coûterait 501
    | insertions. *Un seuil qu'on ne peut pas atteindre en test est un seuil qu'on ne teste pas.*
    |
    */
    'cities_max' => 500,

];

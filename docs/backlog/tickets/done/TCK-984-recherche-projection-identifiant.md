---
id: TCK-984
title: "La requête de page de la recherche ne demande au moteur que l'identifiant"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-55--places-réservées-et-emplacements-entre-deux-pages-de-la-recherche"
tags: [api, search, performance, pistes]
---

## Contexte

Réf : **P55.03** du fichier de pistes, `retenu · autonome` (A2 et A6). La requête nominale de
`PropertySearchService::search()` et la requête élargie de `widen()` demandaient les documents
entiers, alors que `hydrate()` ne lit que `id` dans chaque hit et recharge tout depuis la base.
Le vivier et `organicExcluding()` portaient déjà `attributesToRetrieve: ['id']`.
Re-mesuré le 2026-10-19 sur `pre-dev` c164b2d8c en lisant les requêtes que le client Meilisearch
envoie : ni la recherche nominale ni la première requête du `/multi-search` élargi ne portent
`attributesToRetrieve`.

## Objectif

Les deux requêtes de page ne rapatrient que `id` ; la page rendue est inchangée.

## Delta à produire

- [x] `search()` : `'attributesToRetrieve' => ['id']` sur la requête nominale.
- [x] `widen()` : `setAttributesToRetrieve(['id'])` sur la requête élargie (pas sur les sondes,
      à `hitsPerPage: 0`).
- [x] `tests/Feature/Search/PropertySearchProjectionTest.php` : un client HTTP qui enregistre les
      envois au moteur ; les deux requêtes portent `['id']`, et la page reste entière (total,
      biens, titre hydraté).

## Critères d'acceptation

- [x] AC1 — La requête nominale envoyée au moteur porte `attributesToRetrieve: ["id"]`.
- [x] AC2 — La requête élargie (position 0 du `/multi-search`) le porte aussi.
- [x] AC3 — Les biens rendus sont les mêmes et hydratés depuis la base.

## Reste à faire

- Corriger la conséquence de l'ADR-0061 (« une troisième en première page ») pour dire que la
  troisième lecture a lieu sur toute page qui a des places réservées : `docs/adr/` est un chemin
  fermé à l'implémenteur.

## Hypothèses (mode sans humain)

- Aucun lecteur des hits n'utilise autre chose que `id` (relu : l. 149, 204, 646, 708, 737, 769
  de la mesure du mesureur ; `alertMatches()` n'est pas touchée).
- Le gain en octets n'est pas mesuré.

## Hors périmètre

- `alertMatches()` demande aussi les documents entiers ; non cité par la piste.

## Notes d'implémentation

- Le test remplace le singleton `Meilisearch\Client` par un client au transport enregistreur
  (Guzzle derrière un `ClientInterface` PSR-18), puis `EngineManager::forgetDrivers()` : sans
  ce second appel, Scout garde le moteur déjà construit et rien n'est enregistré.
- Avant correctif : 2 rouges sur 2. Ablation : service remis à `pre-dev` → 2 rouges ; correctif
  réappliqué → 2 verts. Voisins (`RechercheConjonctive`, `PropertySearchService`,
  `PropertySearchVocabulary`, `ReservedTopResults`) : 29 verts.

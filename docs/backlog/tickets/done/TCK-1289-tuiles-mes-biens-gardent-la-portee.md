---
id: TCK-1289
title: "Les tuiles de « Mes biens » gardent la portée de la liste, et « Vendus / loués » ouvre les deux statuts"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-131--paramètres-de-requête-des-liens-profonds-et-leur-survie-aux-redirections"
tags: [front, properties, pistes]
---

## Contexte

Réf : **P131.02** du fichier de pistes, `validé (délégué)` (V7 accordé).

Décision du porteur (déléguée) : chaque tuile construit son `href` avec la portée courante (`only_mine=1` ou `user_id`), et « Vendus / loués » reste une seule tuile qui mène à `/app/properties?status=sold,rented`, active pour cette valeur ; un test de la page montée sous `only_mine=1` attend les `href` des quatre tuiles

Sur `/app/properties`, les quatre décomptes sont pris sous la portée de la liste (`only_mine=1` ou
`user_id`), mais les `href` des tuiles sont des chaînes fixes : sous « mes biens », une tuile
compte mes biens et ouvre ceux de toute l'agence. La tuile « Vendus / loués » compte les deux
statuts et n'ouvrait que `status=sold`.

## Objectif utilisateur

L'agent qui clique une tuile voit la liste que la tuile a comptée.

## Contrat de données

Aucun changement d'API. `GET /api/properties?filter[status]=sold,rented` filtre déjà les deux
statuts (`status` est un filtre exact de `Property::$requestFilterable`, qui lit une liste à
virgules) : un test de `PropertyCrudTest` l'épingle.

## Delta à produire

- [x] `properties/(liste)/page.tsx` : `href` de chaque tuile = sa requête + la portée courante.
- [x] « Vendus / loués » → `?status=sold,rented`, active pour cette valeur.
- [x] Test de la page sous `only_mine=1`, sous `user_id`, sans portée, et de l'état actif.
- [x] Test d'API du filtre de statut à deux valeurs.

## Critères d'acceptation

- [x] AC1 — Sous `only_mine=1`, les quatre tuiles portent `only_mine=1`.
- [x] AC2 — Sous `user_id=N`, elles portent `user_id=N`.
- [x] AC3 — « Vendus / loués » mène à `/app/properties?status=sold,rented` et y est active.
- [x] AC4 — L'API rend les biens vendus et loués, et eux seuls, pour `filter[status]=sold,rented`.

## Hors périmètre

- L'état actif de la tuile « Total » sous « mes biens » (inchangé : elle n'est active que sans
  aucun filtre).
- L'affichage de `sold,rented` dans le sélecteur de statut des filtres.

## Notes d'implémentation

- `only_mine=1` l'emporte sur `user_id`, comme dans le calcul des filtres de la page.
- La virgule reste littérale dans l'URL (pas de `URLSearchParams`, qui l'encoderait en `%2C`),
  comme l'écrit la décision.
- Ablation : `page.tsx` rendu à `HEAD` → 4 rouges sur 4 ; correctif remis → 4 verts. Le test
  d'API est vert sans correctif : il épingle une prémisse (le filtre à deux valeurs), pas le
  correctif.

---
id: TCK-786
title: "/search/documents et /search/messages : la plage de dates filtre dans Meilisearch, avant la pagination"
status: doing
phase: P2
family: applicatif
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#24-recherche--filtres"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-16--listes-internes-sur-un-modèle-searchable"
tags: [back, recherche, scout, pistes]
---

## Contexte

Réf : **P16.05** du fichier de pistes, `retenu · autonome` (A1 : TCK-094 spécifie
`filter[date_from]` / `filter[date_to]`, et `DocumentSearchTest::test_date_range_filter` en est
le contrat).

`DocumentSearchService` et `MessageSearchService` passent la plage de dates par
`$search->query(...)`, donc en SQL, sur une page **déjà découpée** par Meilisearch. Une page peut
revenir vide alors que des correspondances existent plus loin, et `total` (recompté en SQL par
Scout) ne correspond pas aux pages. Le commentaire invoque « datetime vs timestamp », alors que
`created_at` est indexé en timestamp et filtrable sur les deux index (`config/scout.php`).

## Delta à produire

- [ ] `date_from` → clause Scout native `created_at >= <début du jour, timestamp>` ;
      `date_to` → `created_at <= <fin du jour, timestamp>`, sur les deux services.
- [ ] Le commentaire « Date range stays an Eloquent refinement » est retiré.
- [ ] Le test de plage de dates passe sur Meilisearch réel (le pilote `collection` ne compare pas
      un timestamp à une colonne `timestamp`).

## Critères d'acceptation

- [ ] AC1 — Documents : avec trois correspondances hors plage plus récentes et une dans la plage,
      `sort=-created_at&per_page=1` rend la correspondance de la plage en page 1, et `total` vaut 1.
- [ ] AC2 — Messages : même cas, même résultat.
- [ ] AC3 — Les bornes sont inclusives au jour, comme avec `whereDate` : un élément créé le jour
      de `date_to` est rendu.

## Hors périmètre

- Les routes restent (la piste proposait leur retrait en alternative) : elles sont gardées par
  `DocumentSearchTest`, `MessageSearchTest` et `MaintenanceThreadAccessTest`.
- Le périmètre de lecture des documents (P16.03, reste du porteur).

## Hypothèses (mode sans humain)

- Les dates de la requête s'entendent dans le fuseau de l'application (UTC, `config/app.php`),
  comme `whereDate` les entendait.

## Notes d'implémentation

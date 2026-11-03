---
id: TCK-1011
title: "Une garde de budget de requêtes sur les chemins de recherche Scout, index peuplé"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: [TCK-1010]
blocks: []
spec_refs:
  features:
    - "docs/features.md#24-recherche--filtres"
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-59--requêtes-sql-des-listes-filtersearch-et-de-la-recherche-publique-index-peuplé"
tags: [api, search, performance, tests, pistes]
---

## Contexte

Réf : **P59.03** du fichier de pistes, `retenu · autonome` (A5). `ProListQueryBudgetTest` et
`PropertyIndexQueryBudgetTest` appellent les listes sans `filter[search]`, Scout coupé : une lecture
par ligne qui n'apparaît qu'avec une recherche n'a aucun témoin. P59.02 (TCK-1010) en était un cas
réel. Re-mesuré le 2026-10-19 sur `pre-dev` bde1d5b43 : `grep -c 'filter\[search\]'` sur les deux
classes → 0 et 0.

## Objectif

Les chemins de recherche Scout que le front appelle coûtent le même nombre de requêtes pour 2 et
pour 12 lignes trouvées, et un test le garde.

## Delta à produire

- [x] `tests/Feature/Search/SearchQueryBudgetTest.php` (ouvert par TCK-1010) : biens et clients et
      demandes d'intervention sous `filter[search]` (les `fields[]` et l'`include=` du front),
      recherche publique `q=` ; lignes garnies (photo, adresse, note, étiquette).

## Critères d'acceptation

- [x] AC1 — Les quatre chemins coûtent autant pour 2 lignes que pour 12.
- [x] AC2 — Une requête par ligne ajoutée sous `Property`, `Customer` ou `MaintenanceRequest` fait
      rougir le chemin correspondant (ablation).
- [x] AC3 — Aucun seuil existant n'est touché.

## Hypothèses (mode sans humain)

- La recherche publique est appelée sans vedette (aucun emplacement payé) : le coût avec vedettes
  est constant par jeu, pas par ligne (mesure de l'explorateur), et n'est pas gardé ici.
- Les URL recopient `DASHBOARD_PROPERTY_FIELDS` (`properties-server.ts`) et les listes de
  `ProListQueryBudgetTest` au 2026-10-19 ; elles ne suivent pas le front d'elles-mêmes.

## Hors périmètre

- `/api/users`, `/api/admin/…` et `GET /api/conversations/contacts?filter[search]` (PR #734).

## Notes d'implémentation

- Ablation : un écouteur `retrieved` temporaire sur les trois modèles, émettant `select 1` →
  4 rouges sur 4 variantes (biens 23/33, clients 23/33, interventions 27/47, publique 6/16) ;
  retiré → 5 verts.
- Le premier appel n'est pas compté (caches de processus), comme dans `ProListQueryBudgetTest`.

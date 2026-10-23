---
id: TCK-1771
title: "L'index de components/console ne réexporte plus les composants client"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-173--écrans-qui-chargent-les-composants-client-de-la-console-par-les-autres-fichiers-indexts-réexportateurs"
tags: [front, performance, console, pistes]
---

## Objectif utilisateur

Un squelette de chargement de la console, ou une page serveur qui n'affiche qu'un en-tête de
console, ne télécharge plus le tableau, la pagination, la barre de filtres ni la recherche.

## Contexte

Réf : **P173.01** du fichier de pistes, `retenu · autonome` (A2, garde A5).

Mesuré avant correctif sur `5932bac2b` : `components/console/index.ts` réexporte `DataTable`,
`DebouncedSearchInput`, `FilterBar` et `Pagination` (`'use client'`) ; les 45 `loading.tsx` de
`(dashboard)/app` ont tous des modules client dans leur graphe, et `overview/agent`,
`overview/owner`, `overview/tenant` et `super-admin/system` y ont les quatre composants (garde
neuve, 93 rouges sur 98).

## Hypothèses (mode sans humain)

- La piste propose deux voies : prendre chaque nom à son fichier dans les importeurs serveur, ou
  retirer de l'`index.ts` les quatre composants client. **Retenue : le retrait** (voie de
  TCK-1461), seule à tenir la garde que la piste demande (« l'`index.ts` de la console ne
  réexporte aucun module `'use client'` ») ; 50 importeurs à reprendre.
- La garde « aucun `loading.tsx` n'a de module client » se borne aux squelettes de la console :
  les deux `loading.tsx` du site public montent la barre de navigation, client par nature. Eux
  sont gardés contre les seuls composants client de la console.
- Les huit `vi.mock('@/components/console')` ne simulent que `PageHeader`, resté dans l'index :
  aucun ne change.

## Delta à produire

- [x] `components/console/index.ts` : plus de `DataTable`, `DebouncedSearchInput`, `FilterBar`
  ni `Pagination` (ni leurs types, ni `CONSOLE_SEARCH_DEBOUNCE_MS`).
- [x] Les 50 importeurs (tests compris) les prennent à leur fichier.
- [x] Garde : `components/console/__tests__/index-sans-composant-client.test.ts`.

## Critères d'acceptation

- [x] AC1 — L'index ne réexporte aucun module `'use client'`.
- [x] AC2 — Aucun `loading.tsx` de `(dashboard)` n'a de module client.
- [x] AC3 — Aucun `loading.tsx` de `src/app`, ni les quatre pages serveur citées, n'atteint
  `DataTable`, `DebouncedSearchInput`, `FilterBar` ni `Pagination`.

## Notes d'implémentation

- Ablation : `index.ts` remis à son état antérieur (importeurs gardés) → 93 rouges sur 98 ;
  rétabli → 98 verts.
- Les importeurs ont été réécrits par l'AST TypeScript (alias et `type` conservés), pas à la main.

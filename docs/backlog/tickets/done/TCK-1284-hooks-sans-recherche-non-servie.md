---
id: TCK-1284
title: "Front : `useLeases`, `useBookings` et `useInvoices` n'offrent plus de `search` que l'API refuse"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#15-transactions--paiements"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-150--sort-filter-et-include-du-front-face-aux-listes-blanches-de-lapi"
tags: [web, queries, query-builder, code-mort, pistes]
---

## Contexte

Réf : **P150.03** du fichier de pistes, `retenu · autonome` (A3).

Les trois hooks acceptent un paramètre `search`, posé en `filter[search]`. `Lease`, `Booking` et
`Invoice` ne déclarent aucun `$requestSearchFields` : l'API rend 400. Aucun appelant ne le passe
aujourd'hui ; le type promet une recherche qui casserait le premier écran à s'en servir.

## Objectif

Le type et la requête des trois hooks ne portent plus `search`.

## Delta à produire

- [x] Retrait de `search` de `UseLeasesParams`, `UseBookingsParams`, `UseInvoicesParams` et de leur
      sérialisation en `filter[search]`.
- [x] Test `sans-recherche-non-servie.tck-1284.test.ts` : `@ts-expect-error` sur le paramètre (jugé
      par `tsc --noEmit`) et filtre envoyé sans `search`.

## Critères d'acceptation

- [x] AC1 — `tsc --noEmit` refuse `search` dans les trois types.
- [x] AC2 — Même forcé, `search` ne part pas dans `filter`.

## Hors périmètre

- Ajouter une recherche côté API (choix de produit : quels champs, Meilisearch ou `LIKE`).
- La garde de contrat front ↔ API (P150.04, à valider).

## Notes d'implémentation

- Ablation : les trois modules remis à `HEAD` → vitest 3 rouges (`search: 'x'` dans le filtre) et
  `tsc --noEmit` 3 erreurs TS2578 (`@ts-expect-error` inutilisé) ; correctif remis → verts.
  `LeasesList`, `InvoicesTable` et `tableaux-nommes.tck-912` verts.

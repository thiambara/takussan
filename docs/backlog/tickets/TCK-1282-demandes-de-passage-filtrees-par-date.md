---
id: TCK-1282
title: "Demandes de passage en agence : `filter[submitted_from]` et `filter[submitted_to]` déclarés au modèle"
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
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-150--sort-filter-et-include-du-front-face-aux-listes-blanches-de-lapi"
tags: [api, super-admin, agence, query-builder, pistes]
---

## Contexte

Réf : **P150.02** du fichier de pistes, `retenu · autonome` (A1).

Les dates « Soumise du / au » de `/super-admin/agency-upgrade-requests` partent en
`filter[submitted_from]` / `filter[submitted_to]`. `AgencyUpgradeRequestController::index` les lit
à la main (`whereDate` `>=` / `<=`, depuis TCK-268), puis passe la même requête à
`AgencyUpgradeRequest::buildQuery()`, dont la liste blanche ne les connaît pas : 400, la liste
tombe en erreur dès qu'une date est posée.

## Objectif

La file filtrée par période rend 200 et les seules demandes soumises dans la période.

## Delta à produire

- [x] `AgencyUpgradeRequest::customQueryFilters()` : `submitted_from` (`>=`) et `submitted_to`
      (`<=`), `AllowedFilter::callback` sur le jour de `submitted_at`, valeur vide ignorée.
- [x] Retrait de la lecture à la main du contrôleur.
- [x] Test `AgencyUpgradeRequestSubmittedRangeTest`.

## Critères d'acceptation

- [x] AC1 — `filter[submitted_from]=…&filter[submitted_to]=…` → 200, les demandes de la période,
      bornes incluses.
- [x] AC2 — Chaque borne seule → 200 et filtre de son côté, y compris avec `filter[status]`,
      `sort=-submitted_at` et `include=agency,submitter` de la page.

## Hors périmètre

- La borne de fin et la valeur mal formée (angle 151).

## Notes d'implémentation

- Même sémantique que l'ancien code (`whereDate`, valeur `trim`, vide ignorée) : seul l'endroit
  change.
- Ablation : modèle et contrôleur remis à `HEAD` → 3 rouges (400) ; correctif remis → 3/3 verts.
  `AgencyUpgradeRequestReviewTest` (17) et `AgencyUpgradeRequestEncryptionTest` (7) verts.

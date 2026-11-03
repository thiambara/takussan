---
id: TCK-1179
title: "Tests de valeur des indicateurs de la performance d'équipe et du tableau de bord d'agence"
status: done
phase: P1
family: technique
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-93--indicateurs-des-tableaux-de-bord-et-du-relevé--valeurs-fausses-sur-des-données-réelles"
tags: [back, dashboard, tests, pistes]
---

## Contexte

Réf : **P93.07** du fichier de pistes, `retenu · autonome` (A5).

`sales_signed`, `customers_added`, `commissions_earned` et `properties_managed` de la performance
d'équipe n'étaient assertés par aucun test ; les compteurs `properties.rented`, `.available`,
`customers_count`, `bookings.pending` et `maintenance.open` du tableau de bord d'agence ne l'étaient
que par `assertJsonStructure`. C'est ainsi que P93.06 est resté invisible.

## Objectif utilisateur

Un indicateur faux de ces deux écrans fait rougir un test.

## Delta à produire

- [x] `TeamPerformanceTest::test_p93_07_…` : un agent, une valeur non nulle et distincte par
      indicateur, un intrus par règle (hors période, autre agence, commission annulée, rôle
      `viewer`, bien possédé et collaboré compté une fois).
- [x] `DashboardAgencyTest::test_p93_07_counters_have_their_value` : idem pour les compteurs.

## Critères d'acceptation

- [x] AC1 — Performance d'équipe : `sales_signed` 1, `customers_added` 3, `commissions_earned`
      55 000, `properties_managed` 4.
- [x] AC2 — Tableau de bord : `total` 6, `rented` 2, `available` 3, `customers_count` 4,
      `bookings.pending` 1, `maintenance.open` 5.
- [x] AC3 — Une mutation du code compté fait rougir le test (ablation).

## Hors périmètre

- `properties.published` : épinglé par TCK-1115 (P93.06).
- Tout changement de code applicatif : c'est un ajout de tests seul.

## Notes d'implémentation

- Ablation par mutation : filtre `cancelled` des commissions retiré de `TeamPerformanceService` →
  rouge (125 000 au lieu de 55 000) ; `in_progress` retiré du compte de maintenance de
  `DashboardAgencyService` → rouge (3 au lieu de 5) ; code rendu → 8/8 et 11/11.
- `commission_entries` porte une unicité (bail, bénéficiaire) : une commission par bail dans le jeu.

---
id: TCK-1187
title: "Les grilles mois et semaine du calendrier rangent en-têtes et jours dans des `row`"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-101--axe-au-navigateur-des-écrans-app-des-autres-profils-et-des-pages-de-détail"
tags: [front, a11y, calendar, pistes]
---

## Contexte

Réf : **P101.01** du fichier de pistes, `retenu · autonome` (A4).

`MonthView` et `WeekView` posent `role="grid"` mais rangent leurs `columnheader` et `gridcell`
sans aucun `role="row"` : axe rend `aria-required-children` sur la grille et
`aria-required-parent` sur 49 nœuds (mois) et 14 (semaine), tous critiques.

## Objectif utilisateur

Un lecteur d'écran lit les vues mois et semaine du calendrier comme une grille de lignes et de
colonnes.

## Delta à produire

- [x] `MonthView` : une rangée `role="row"` pour les en-têtes, puis une par semaine, en
      `display: contents` (classe `contents`) pour garder la grille de sept colonnes.
- [x] `WeekView` : `role="row"` sur les deux conteneurs existants (en-têtes, jours), déjà
      chacun une grille de sept colonnes.
- [x] Test `CalendarGrid.aria-rows.test.tsx` : parent `row` direct pour chaque en-tête et chaque
      cellule, et axe (`aria-required-children`, `aria-required-parent`) sans violation.

## Critères d'acceptation

- [x] AC1 — Vue mois : 7 en-têtes dans une `row`, chaque semaine (7 jours) dans la sienne, zéro
      violation des deux règles.
- [x] AC2 — Vue semaine : idem, 7 + 7.
- [x] AC3 — Sans le correctif, le test rougit (ablation).

## Hors périmètre

- La navigation aux flèches (`onKeyDown`, `tabIndex` itinérant, `aria-selected`) qu'annonce le
  rôle `grid` : la piste garde `grid`, et ce comportement neuf n'est pas demandé.
- Aucune classe de mise en page n'a changé : rien n'a été mesuré au navigateur.

## Notes d'implémentation

- Choix entre les deux voies de la piste : `row` en `display: contents`, rôle `grid` gardé (celle
  que recommande la mesure). `display: contents` sur un élément porteur de rôle est exposé à
  l'arbre d'accessibilité par les navigateurs actuels (hypothèse, non mesurée au navigateur).
- Ablation : `MonthView.tsx` et `WeekView.tsx` rendus à `pre-dev` → les 2 tests rouges (49 puis
  14 nœuds sans `row`) ; correctif remis → 2/2 verts.

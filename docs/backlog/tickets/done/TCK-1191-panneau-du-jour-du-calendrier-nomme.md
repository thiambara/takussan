---
id: TCK-1191
title: "Le panneau du jour du calendrier prend le nom de son titre"
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

Réf : **P101.04** du fichier de pistes, `retenu · autonome` (A4).

Sur `/app/calendar`, le panneau du jour sélectionné est un second `aside` sans nom, à côté de
celui de la barre latérale : axe rendait `landmark-unique` pour quatre profils.

## Objectif utilisateur

Un lecteur d'écran distingue le panneau du jour de la barre latérale dans la liste des repères.

## Delta à produire

- [x] `SelectedDayPanel` (`CalendarPage.tsx`) : `aria-labelledby` de l'`aside` vers un `id`
      (`useId`) posé sur son `h3`, le libellé du jour déjà affiché.
- [x] Test dans `CalendarPage.test.tsx` : le repère `complementary` porte le nom du jour.

## Critères d'acceptation

- [x] AC1 — Après sélection du 20 avril, `getByRole('complementary', { name: /lundi 20 avril/ })`
      est le panneau.
- [x] AC2 — Aucun texte neuf.
- [x] AC3 — Sans le correctif, le test rougit (ablation).

## Hors périmètre

- L'`aside` sans nom de `AppSidebar` et ceux de `/app/messages` (P68.08, au porteur).

## Notes d'implémentation

- Voie retenue des deux de la piste : `aria-labelledby` (l'`aside` reste un repère), celle que
  recommande la mesure.
- Ablation : `CalendarPage.tsx` rendu à `pre-dev` → le test neuf rouge, les 15 autres verts ;
  correctif remis → 16/16.

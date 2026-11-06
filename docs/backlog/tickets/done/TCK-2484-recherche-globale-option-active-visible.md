---
id: TCK-2484
title: Recherche globale de la console — l'option active se voit (fond accent et encre appariée, plus `bg-muted`)
status: done
phase: P3
family: bug
estimate: S
wave: 82
created: 2026-11-06
updated: 2026-11-06
depends_on: [TCK-2482]
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models: []
tags: [front, super-admin, a11y, contraste, recherche]
---

## Objectif utilisateur

L'opérateur de la plateforme qui parcourt les résultats de la recherche globale aux flèches voit
quel résultat Entrée va ouvrir.

## Contrat de données

Aucun changement : `GET /api/super-admin/search` (TCK-600) tel qu'il est.

## Direction UX / Artistique

Le surlignage du `Combobox` du dépôt (`ui/combobox.tsx`) : fond `accent`, encre appariée
(`accent-foreground`), pour tout ce que l'option active porte — libellé, sous-libellé, agence.
C'est le correctif I2 de TCK-2482 (palette de commandes), appliqué à l'autre liste au clavier de
la console.

## Contraintes strictes (métier)

- Le focus DOM reste au champ (`aria-activedescendant`) : l'option active n'a pas d'anneau, son
  fond est le SEUL repère de ce qu'Entrée ouvrira. Il se distingue de la surface du dialogue
  (`--popover`) à 3:1 au moins (WCAG 1.4.11), et tout texte qu'il porte s'y lit à 4,5:1 (1.4.3),
  en clair comme en sombre.
- Relevé de départ (revue de TCK-2482, suite (a)) : `bg-muted` sur `--popover` = **1,18:1** en
  clair, 1,21:1 en sombre ; et `text-muted-foreground` sur `bg-accent` = 1,04:1 — l'encre des
  sous-libellés DOIT suivre le fond.
- Aucun jeton neuf, aucune couleur arbitraire (gardes de jetons, `check-heritage-encre`).

## Delta à produire

- [x] `GlobalSearch.tsx` : option active `bg-accent text-accent-foreground` ; sous-libellé et agence
      en `text-accent-foreground` quand l'option est active, `text-muted-foreground` sinon.
- [x] Test de contraste sur les jetons du design system (`src/test/contraste-wcag.ts`, patron
      d'`AppTopbar.a11y.test.tsx` et de la revue I2 de `PaletteDeCommandes.test.tsx`), clair et
      sombre, sur une option qui porte un sous-libellé ET une agence.
- [x] Ablations : l'ancien `bg-muted` rougit ; un sous-libellé resté `text-muted-foreground` sur
      l'accent rougit.

## Critères d'acceptation

- [x] AC1 — Option active : fond ≥ 3:1 sur la surface héritée du dialogue, libellé, sous-libellé et
      agence ≥ 4,5:1 sur ce fond — en clair et en sombre (test sur les classes rendues, résolues par
      les jetons).
- [x] AC2 — Le test rougit sur l'ancien surlignage (`bg-muted`) et sur une encre `muted` gardée
      sur l'accent (ablations écrites dans les notes).
- [x] AC3 — Gardes du dépôt et du front vertes (jetons, `check-heritage-encre`, tsc, lint).
- [x] AC4 — Suites entières vertes (par la CI). Web CI run 42253752157 (c40171077, 10 285 tests) ; API CI run 42238024674 (lint-and-test sur ded5da40d, attesté pour c40171077) — 2026-11-06.

## Hors périmètre

- L'option désactivée (résultat sans écran, `aria-disabled`, `opacity-70`) : WCAG exempte un
  composant inactif ; son rendu ne change pas.
- Le `Combobox` du dépôt lui-même (son `indice` reste `muted` sur l'accent) : relevé à part si besoin.

## Notes d'implémentation

Commit `e1dd0bef8` (2026-11-06, agent `suites-front`, branche `fix/suites-coque-dynamique`).

- **Correctif** : option active `bg-accent text-accent-foreground` ; sous-libellé et agence en
  `text-accent-foreground` quand l'option est active, `text-muted-foreground` sinon (une seule
  constante `encreSecondaire`). Le reste du composant ne change pas.
- **Test** (`GlobalSearch.test.tsx`, « TCK-2484 ») : un résultat qui porte libellé + sous-libellé +
  agence ; fond actif (composé) contre la surface héritée du dialogue ≥ 3:1, chacun des trois textes
  ≥ 4,5:1 sur ce fond (alpha composé), clair ET sombre (`JETONS_CLAIR`, `JETONS_SOMBRE`) ; témoin :
  l'option inactive ne peint aucun fond. Rouge avant correctif : **1,18:1** (clair) et **1,21:1**
  (sombre), les chiffres de la revue de TCK-2482.
- **Ablations** (script, mutation → test → restauration, `cmp` identique à la fin) :
  a) composant de HEAD (`bg-muted`) → 2 rouges, 1,18 / 1,21 ; b) fond accent, précisions restées
  `text-muted-foreground` → 2 rouges, 1,04 / 1,56 ; c) fond accent, libellé `text-foreground` →
  2 rouges, 3,18 / 3,38 ; d) témoin restauré → vert.
- **Gardes** : `tsc` 0, `lint` 0, `check:i18n`, `check:i18n-namespaces`, `check:classes-emises`,
  `chemin-api.garde` (29), `scripts/check-*.mjs` : tous verts (dont `check-heritage-encre`).
- **Écart** : aucun. L'option désactivée active (`opacity-70`) n'est pas mesurée par le test (hors
  périmètre) ; calculée à la main, l'accent à 70 % sur blanc fait ≈ 2,96:1 contre la surface.
- AC4 (suites entières) : par la CI.

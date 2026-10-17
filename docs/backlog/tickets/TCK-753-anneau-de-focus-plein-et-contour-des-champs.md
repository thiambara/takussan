---
id: TCK-753
title: "Anneau de focus plein, et contour des champs à 3:1"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-7--accessibilité-du-front-wcag-22-aa"
tags: [front, accessibilite, contraste, pistes]
---

## Contexte

Réf : **P07.09** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

`focus-visible:ring-ring/50` (primitives `ui/` et 80 autres sites) rend 2,08:1 sur
`--background` ; sur un bouton plein, c'est le seul signal de focus. La règle de base
`* { outline-ring/50 }` de `globals.css` est atténuée de même. `--input` (`#ebe5d5`), seul contour
d'un champ, rend 1,20:1 sur `--background` et 1,26:1 sur `--card` (WCAG 2.2 §1.4.11 : 3:1).

## Décision du porteur

anneau de focus plein ; --input assombri à 3:1

## Objectif utilisateur

Au clavier, on voit où est le focus ; un champ se distingue de son fond.

## Contraintes strictes

- Thème clair seulement : le `--input` sombre n'est pas visé par la piste.
- **Hypothèse** : `--input` passe à `#918672`, ton de la palette Lin assombri, qui tient 3:1 sur
  `--background` (3,41), `--card` (3,59) et `--muted` (3,04).
- Le fond d'un champ désactivé (`disabled:bg-input/50`) et le séparateur de `TagsManager`
  (`divide-input`) ne sont pas des contours de champ : ils passent sur `--border`, qui garde
  l'ancienne valeur, pour ne pas changer d'aspect.

## Delta à produire

- [x] `ring-ring/50` → `ring-ring` dans `src/`, et `outline-ring/50` → `outline-ring` dans
      `globals.css`.
- [x] `--input` clair à `#918672` (`globals.css` et `JETONS_CLAIR`).
- [x] `disabled:bg-input/50` → `disabled:bg-border/50` (`input`, `textarea`) ; `divide-input` →
      `divide-border` (`TagsManager`).
- [x] `src/test/__tests__/focus-et-contour-des-champs.contraste.test.ts`.

## Critères d'acceptation

- [x] AC1 — Aucun `ring-ring/<n>` ni `outline-ring/<n>` dans `src/`.
- [x] AC2 — `--input` tient 3:1 sur `--background` et sur `--card`.

## Hors périmètre

- Le thème sombre.
- Les anneaux d'une autre couleur (`ring-destructive/20` des champs invalides…).

## Notes d'implémentation

- **Ablation** : sources d'avant remises (test gardé) → 4 rouges sur 5 (84 `ring-ring/50` dans
  58 fichiers, `--input` à 1,20:1 et 1,26:1, `disabled:bg-input/50`) ; correctif remis → 5 verts.
- `jetons-compiles.test.ts` confronte `JETONS_CLAIR` à la compilation de `globals.css` : les deux
  valeurs de `--input` changent ensemble.

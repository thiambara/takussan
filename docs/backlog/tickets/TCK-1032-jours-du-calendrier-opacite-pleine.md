---
id: TCK-1032
title: "Les jours de la semaine du calendrier retrouvent leur contraste (opacité pleine)"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-68--passage-axe-au-navigateur-des-écrans-connectés-app-console-super-admin"
tags: [web, a11y, contraste, calendar, pistes]
---

## Contexte

Réf : **P68.04** du fichier de pistes, `retenu · autonome` (A4). La feuille de react-day-picker,
chargée par `globals.css` en couche `rdp`, pose `opacity: var(--rdp-weekday-opacity)` (0,75) sur
`.rdp-weekday`. `ui/calendar.tsx` y ajoute `text-muted-foreground` sans rétablir l'opacité : les
en-têtes de jours tombent à 3,33:1 (axe `color-contrast`, « serious »), sous le seuil de 4,5:1.
À opacité pleine, le jeton `--muted-foreground` donne 5,72:1.

## Objectif

Les en-têtes de jours du calendrier s'affichent à opacité pleine, dans la couleur du jeton.

## Delta à produire

- [x] `takussan-web/src/components/ui/calendar.tsx` : `opacity-100` dans la classe `weekday`.
- [x] `calendar-charte-tck-582.test.tsx` : les classes que porte `.rdp-weekday` produisent une
      opacité pleine dans la couche `utilities`, compilée par le Tailwind du dépôt.

## Critères d'acceptation

- [x] AC1 — Les utilitaires de `.rdp-weekday` déclarent `opacity: 100%`, qui bat la couche `rdp`.
- [x] AC2 — La couleur reste `text-muted-foreground` (classe posée sur `.rdp-weekday`).
- [x] AC3 — Ablation : sans `opacity-100`, le test rougit.

## Hypothèses (mode sans humain)

- `opacity-100` plutôt que `[--rdp-weekday-opacity:1]` : même effet, la couche `utilities` passe
  après `rdp` (garde existante du même fichier), et c'est un utilitaire nommé.

## Hors périmètre

- Les autres opacités de la feuille (`--rdp-outside-opacity`, `--rdp-disabled-opacity`).

## Notes d'implémentation

- Avant correctif, les utilitaires compilés de `.rdp-weekday` ne déclarent aucune opacité : le
  test rougit sur elle.
- Ablation : `opacity-100` retiré → 1 rouge sur 6 ; remis → 6 verts.
- Piège : la tête de `globals.css` que compile le test ne porte pas le `@theme inline`, donc
  `text-muted-foreground` n'y produit aucune règle. La couleur se vérifie par la classe posée,
  pas par le CSS compilé.

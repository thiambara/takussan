---
id: TCK-674
title: "Un dialogue plus haut que l'écran défile en lui-même : hauteur bornée dans la primitive"
status: done
phase: P0
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features: []
  design:
    - docs/design-guidelines.md#composants
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-8--parcours-sur-téléphone
tags: [front, ui, mobile, pistes]
---

## Contexte

Réf : **P08.02** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

La primitive `DialogContent` (`takussan-web/src/components/ui/dialog.tsx`) est centrée en
`fixed top-1/2 -translate-y-1/2`, sans hauteur maximale ni défilement. Le verrou de défilement
de Base UI fige le document pendant qu'un dialogue est ouvert : un dialogue plus haut que la
fenêtre (celui de la demande de visite sur un 360×640) a son titre et son bouton d'envoi hors de
l'écran, sans moyen de les atteindre. 3 `DialogContent` sur 69 fichiers posaient eux-mêmes
`max-h-[90dvh] overflow-y-auto`.

## Décision du porteur

max-h-[calc(100dvh-2rem)] overflow-y-auto dans la primitive

## Objectif

Tout dialogue fondé sur `DialogContent` tient dans la fenêtre et fait défiler son contenu quand
il la dépasse.

## Delta à produire

- [x] `DialogContent` : `max-h-[calc(100dvh-2rem)] overflow-y-auto` dans les classes de base.
- [x] Test : `components/ui/__tests__/dialog-hauteur-bornee.test.tsx`, qui lit le CSS compilé
      par Tailwind pour les classes du dialogue rendu.

## Critères d'acceptation

- [x] AC1 — Le dialogue rendu (avec la classe d'un appelant réel, `sm:max-w-lg`) compile
      `max-height: calc(100dvh - 2rem)` et `overflow-y: auto`.

## Hypothèses (mode sans humain)

- La décision ne retient que la borne dans la primitive : ni pied collant ni feuille du bas sous
  `sm`, que la `Piste` proposait aussi comme options.
- Les trois appelants qui posent `max-h-[90dvh] overflow-y-auto` sont laissés tels quels : `cn()`
  (tailwind-merge) fait prévaloir leur `max-h`, comportement inchangé pour eux.

## Hors périmètre

- Les autres primitives superposées (`alert-dialog`, panneaux latéraux), non citées par la piste.
- Le rendu réel du dialogue de visite sur un 360×640 n'a pas été mesuré dans un navigateur
  (jsdom ne calcule aucune mise en page).

## Notes d'implémentation

- Rouge avant correctif : `aucune hauteur maximale compilée` (le CSS compilé ne porte aucun
  `max-height`).
- Ablation : `dialog.tsx` remis à sa version de `pre-dev` → même rouge ; correctif remis → vert.
- Piège : un appelant qui passerait `overflow-hidden` annulerait le défilement par
  tailwind-merge ; aucune ligne `<DialogContent` ne le fait aujourd’hui (`grep`).

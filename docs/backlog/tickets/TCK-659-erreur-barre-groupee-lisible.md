---
id: TCK-659
title: "L'erreur de la barre d'actions groupées tient 4,5:1"
status: done
phase: P0
family: bug
estimate: S
wave: null
created: 2026-10-15
updated: 2026-10-15
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-7--accessibilité-du-front-wcag-22-aa
tags: [front, accessibilite, contraste, pistes]
---

## Contexte

Réf : **P07.03** du fichier de pistes (classement A4 : le contraste revient sur des jetons
existants, sans texte neuf). Dans la liste pro des biens, l'échec d'une action groupée s'affiche
dans la barre sombre (`bg-foreground/95`) par un `<span role="alert">` en `text-destructive`,
encre pensée pour un fond clair : 2,23:1 en thème clair, 2,11:1 en sombre, sous les 4,5:1 de
WCAG 2.2 §1.4.3. `scripts/check-destructive-contrast.mjs` ne lit que `bg-destructive/NN` et ne
voit pas ce fond.

## Objectif

Le message d'erreur d'un lot est lisible (≥ 4,5:1) dans les deux thèmes.

## Delta à produire

- [x] `PropertyList.tsx` (barre d'actions groupées) : l'alerte devient une pastille claire
      `bg-background text-destructive` (avec `rounded-md px-2 py-0.5`).
- [x] Test : `PropertyList.bulk-alerte.contraste.test.tsx`, qui rend la barre, fait échouer un
      lot, et compose l'encre de l'alerte sur chacun de ses fonds possibles, dans les deux thèmes.

## Critères d'acceptation

- [x] AC1 — L'alerte rendue après l'échec d'un lot tient ≥ 4,5:1 sur chacun de ses fonds
      (le sien, ou celui hérité de la barre), en thème clair et en thème sombre.

## Hypothèses (mode sans humain)

- La `Piste` propose deux options : une pastille claire, ou l'encre claire de la barre avec une
  icône. La pastille est retenue : c'est celle que le mesureur a chiffrée (6,61:1 en clair,
  7,17:1 en sombre), elle garde la couleur qui signale l'erreur, et elle n'ajoute ni icône ni
  texte.

## Hors périmètre

- Les motifs de refus de la même barre (`text-primary-foreground/80`), non mesurés ici.

## Notes d'implémentation

- Rouge avant correctif : 2 écarts — clair 2,23:1 (`text-destructive` sur `bg-foreground/95`
  posé sur `#fcf9f3`), sombre 2,11:1.
- Ablation (`PropertyList.tsx` remis, test gardé) : les deux mêmes écarts ; correctif remis : vert.
- Le test passe par le DOM rendu (`fondsPossibles`) et non par le lecteur statique : l'alerte
  n'existe qu'après l'échec d'un lot, et son fond est hérité de la barre.

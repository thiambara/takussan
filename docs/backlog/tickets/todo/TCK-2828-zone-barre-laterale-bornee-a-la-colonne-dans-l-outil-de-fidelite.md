---
id: TCK-2828
title: "L'outil de fidélité borne la zone « barre latérale » à la colonne, pas à tout le cadre 1280"
status: todo
phase: P3
family: technique
estimate: S
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
  adr: []
tags: [outil, fidelite, audit-ux, app, bureau]
---

## Objectif utilisateur

Celui qui lit un rapport de fidélité à 1280 sait si la colonne de navigation du produit est la colonne de la
maquette — et non si le cadre entier l'est.

## Origine

Ajout de la vérification de TCK-2618, non traité par TCK-2738 (Notes, « Non traité, signalé »). Le rôle
« coque · barre latérale » de `takussan-web/scripts/fidelite/roles-coque.json` se choisit par une zone
(`y: 0, h: 900, tol: 40, wMin: 200`) : `choisir` (`comparer.mjs`) retient la première boîte de 900 de haut,
d'au moins 200 de large — c'est-à-dire le cadre 1280×900 entier. Les écarts de bureau mesurent donc le cadre,
pas la colonne. La maquette n'a pas de repère de colonne (pas de `slot`) : `choisir` n'a pas de borne de zone
qui l'exprime.

## Delta

- `comparer.mjs` / `roles-coque.json` : une borne de zone qui retient la colonne (largeur maximale, ou boîte la
  plus étroite pleine hauteur), côté maquette comme côté produit.
- `fidelite-comparer.test.ts` : un cas où le cadre entier et la colonne coexistent ; seul le second est retenu.

## Critères d'acceptation

- [ ] AC1 — sur un relevé réel à 1280 (persona admin, `/app`), le rôle retient la colonne (largeur de l'ordre
  de celle de la barre latérale, pas 1280). Preuve : relevé et boîte retenue.
- [ ] AC2 — le même relevé, avant ce ticket, retenait le cadre entier. Le test est rouge sans la borne
  (ablation).

## Hors périmètre

- Le rôle « barre d'onglets » du téléphone (TCK-2738, déjà borné par `slot`).

## Notes d'implémentation

_(vide)_

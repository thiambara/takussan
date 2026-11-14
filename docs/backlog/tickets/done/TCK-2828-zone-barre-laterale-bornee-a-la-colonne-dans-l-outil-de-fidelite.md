---
id: TCK-2828
title: "L'outil de fidélité borne la zone « barre latérale » à la colonne, pas à tout le cadre 1280"
status: done
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

- [x] AC1 — sur un relevé réel à 1280 (persona admin, `/app`), le rôle retient la colonne (largeur de l'ordre
  de celle de la barre latérale, pas 1280). Preuve : relevé et boîte retenue.
  *Preuve (2026-11-14)* : relevé produit admin `/app` du 2026-11-13 (17:52 Z) et maquette
  `app-accueil/a-0-bureau-1280` — le rôle retient `aside 0,0 272×900` des deux côtés. Sur la comparaison
  entière de ces deux relevés, les lignes du rôle passent de 149 (129 en écart) à 58 (35 en écart).
- [x] AC2 — le même relevé, avant ce ticket, retenait le cadre entier. Le test est rouge sans la borne
  (ablation).
  *Preuve* : avant, `body 0,0 1280×900` (produit) et `div 0,0 1280×900` (maquette). Ablations, une à la fois :
  `wMax` retiré de `roles-coque.json` → 2 rouges ; la borne retirée de `choisir` → 3 rouges ; fichiers
  restaurés, md5 vérifiés.

## Hors périmètre

- Le rôle « barre d'onglets » du téléphone (TCK-2738, déjà borné par `slot`).

## Notes d'implémentation

- Borne retenue : `wMax` (largeur maximale) dans le sélecteur `zone`, optionnelle — les autres zones sont
  inchangées. `wMax: 400` des deux côtés : écarte le cadre (1280) et le `main` (1008), garde la colonne (272).
- Une barre latérale repliée (plus étroite que `wMin: 200`) ne trouve toujours aucune boîte : le rôle rend
  absent, plutôt que de retomber sur le cadre comme avant.

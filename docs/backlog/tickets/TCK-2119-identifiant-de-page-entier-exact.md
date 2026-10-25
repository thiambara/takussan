---
id: TCK-2119
title: "Une page de détail n'accepte qu'un identifiant entier exact, écrit en chiffres"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#2-domaines-applicatifs-transverses"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-215--identifiants-numériques-de-route-hors-de-bigint-sur-les-routes-connectées"
tags: [front, routes, pistes]
---

## Contexte

Réf : **P215.03** du fichier de pistes, `retenu · autonome` (A1). `idDeDetail` acceptait tout
`Number(brut)` entier et positif : `99999999999999999999` devenait `1e20`, réécrit
`100000000000000000000` vers l'API (500, P215.01) ; `12345678901234567` devenait
`12345678901234568`, une autre ligne que celle du chemin ; `1e3` et `0x10` étaient lus 1000 et 16.
Le docblock de la fonction veut qu'un chemin qui ne désigne aucune ligne soit refusé.

## Objectif utilisateur

Une URL de détail altérée rend la page introuvable, et jamais la fiche d'une autre ligne.

## Contrat de données

Aucun changement pour un identifiant réel : les identifiants de la base sont loin de
`Number.MAX_SAFE_INTEGER`.

## Delta à produire

- [x] `idDeDetail` : `^[1-9][0-9]{0,15}$`, puis `Number.isSafeInteger`.
- [x] Tests unitaires de `idDeDetail` : vingt chiffres, `12345678901234567`, `MAX_SAFE_INTEGER + 1`,
  `1e3`, `0x10`, `042` refusés ; `MAX_SAFE_INTEGER` accepté.

## Critères d'acceptation

- [x] AC1 — ces valeurs rendent `null`, donc `notFound()` par `exigerRessource`, sans interroger l'API.
- [x] AC2 — `42` et le plus grand entier exact restent des identifiants.

## Hypothèses

- `042` est refusé avec le reste : la piste fixe `^[1-9][0-9]{0,15}$`, et aucun lien du front n'écrit
  de zéro de tête.
- `properties/[id]/page.tsx` garde son `Number(id)` : son layout passe par `exigerRessource` d'abord.

## Notes d'implémentation

- Ablation : `ressource-de-detail.ts` de `pre-dev` → 6 rouges ; remis → 21/21.

---
id: TCK-1463
title: "Connexion et inscription ne chargent que les schémas d'authentification"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-137--écrans-qui-chargent-les-champs-de-formulaire-et-le-calendrier-par-le-fichier-indexts-de-componentsforms"
tags: [front, performance, auth, pistes]
---

## Objectif utilisateur

Les pages de connexion et d'inscription ne chargent plus les schémas des biens, baux, états des
lieux, paiements… pour un seul schéma.

## Contexte

Réf : **P137.04** du fichier de pistes, `retenu · autonome` (A2).

Mesuré avant correctif sur `58c404ecf` : le graphe client de `login` et `register` compte
`lib/schemas/index.ts` et ses onze modules (garde neuve, 2 rouges).

## Hypothèses (mode sans humain)

- `lib/schemas/index.ts` n'a plus d'importeur ; son retrait, que la piste laisse « à mesurer
  côté tests », n'est pas fait ici (reste).

## Delta à produire

- [x] `login/page.tsx`, `register/page.tsx` : schémas pris à `@/lib/schemas/auth`.
- [x] Garde : `graphe-client-de-l-authentification.test.ts` (seuls `auth`, `common` et
  `messages` de `lib/schemas`).

## Critères d'acceptation

- [x] AC1 — Le graphe client des deux pages ne compte que `lib/schemas/auth.ts`, `common.ts` et
  `messages.ts`.

## Reste à faire

> retirer `lib/schemas/index.ts`, sans importeur depuis TCK-1463

## Notes d'implémentation

- Ablation : imports remis à `@/lib/schemas` → 2 rouges ; rétablis → 5 verts.

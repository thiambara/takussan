---
id: TCK-1457
title: "Vérification d'adresse, réinitialisation et retour OAuth ne chargent plus react-hook-form ni le calendrier"
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

Les pages `verify-email`, `reset-password` et le retour OAuth se chargent sans react-hook-form,
react-day-picker ni date-fns, qu'elles n'emploient pas.

## Contexte

Réf : **P137.01** du fichier de pistes, `retenu · autonome` (A2 : performance sans changement de
résultat).

Mesuré avant correctif sur `58c404ecf` : le graphe client des trois pages atteint `date-fns`
par `components/forms/index.ts` → `FormDatePicker` / `FormDateTimePicker` (garde neuve,
3 rouges).

## Delta à produire

- [x] `verify-email/page.tsx`, `reset-password/page.tsx`, `DefiSecondFacteur.tsx` : `FormError`
  et `FormGlobalError` pris à `@/components/forms/FormError`.
- [x] Garde : `src/app/__tests__/graphe-client-de-l-authentification.test.ts`.

## Critères d'acceptation

- [x] AC1 — Aucune des trois pages n'atteint react-hook-form, `@hookform/resolvers`,
  react-day-picker ni date-fns.
- [x] AC2 — Rendu inchangé : les tests de rendu de `(auth)/auth/__tests__` restent verts.

## Notes d'implémentation

- Ablation : les trois imports remis à `@/components/forms` → 3 rouges ; remis → 3 verts.

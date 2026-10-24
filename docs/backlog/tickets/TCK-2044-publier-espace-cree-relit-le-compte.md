---
id: TCK-2044
title: "L'espace créé par « Publier » entre dans le compte que le navigateur connaît"
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
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-202--gestes-qui-changent-apiauthme-sans-relire-le-contexte-dauthentification"
tags: [web, publication, profils, pistes]
---

## Objectif

Après la création sans question de l'espace par `/publish`, `useAuth().user` porte les rôles et
l'agence du nouvel espace.

## Contexte

Réf : **P202.05** du fichier de pistes, `retenu · autonome` (A1). Contrat écrit par l'assistant
hôte (`HostIndividualWizard`), qui fait `refreshUser()` après le même geste.

- `/publish` invalidait la liste des profils puis naviguait, sans `refreshUser()` : le contexte
  gardait `roles: ['customer']` et `agency_id: null`.

## Delta à produire

- [x] `creerPuisPartir` : `await refreshUser()` après une création réussie, avant la navigation.
- [x] Test de la relecture et de son ordre, et de son absence sur un refus.

## Critères d'acceptation

- [x] AC1 — Création réussie : `refreshUser` est appelé avant `router.replace('/app/properties/new')`.
- [x] AC2 — Drapeau éteint : aucune relecture.

## Hors périmètre

- La cause commune de l'angle (P202.01, à valider).

## Notes d'implémentation

- Test : `takussan-web/src/app/publish/__tests__/page.relecture.tck-2044.test.tsx`. Avant
  correctif : AC1 rouge (ordre `['replace /app/properties/new']`).
- Ablation : `page.tsx` à `HEAD` → AC1 rouge ; remis → vert.

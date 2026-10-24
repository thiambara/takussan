---
id: TCK-1901
title: "La liste de l'équipe porte l'agence dans sa clé : un changement de profil ne sert plus les membres de l'agence quittée"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-197--clés-tanstack-query-des-lectures-de-lagence-active-face-au-changement-de-profil"
tags: [web, profils, tanstack-query, equipe, pistes]
---

## Objectif

Après un changement de profil vers une autre agence, l'écran Équipe relit et affiche les membres
de la nouvelle agence.

## Contexte

Réf : **P197.02** du fichier de pistes, `retenu · autonome` (A1).

- `TeamConsole` lit les membres par le relais `/api/admin-users`, qui pose l'indice du profil
  actif ; sa clé `['admin-users', 'list', params]` ne portait pas l'agence, que la page lui passe
  pourtant en `agencyId`.
- `router.refresh()` laisse la console montée : la liste et les rôles de l'agence quittée
  restaient affichés, et les gestes de ligne partaient sous la nouvelle agence.
- Contrat écrit : TCK-143 (l'agence courante reflète le nouveau profil sans recharger la page).

## Hypothèses (mode sans humain)

- La réponse de l'API à un geste de ligne sur un membre de l'agence quittée n'est pas mesurée et
  n'entre pas dans ce ticket.

## Delta à produire

- [x] Clé `['admin-users', 'list', agencyId, params]` dans `TeamConsole.tsx`.
- [x] Test Vitest de rerendu sous une autre agence.

## Critères d'acceptation

- [x] AC1 — Rerendue avec une autre `agencyId`, la console relit `/api/admin-users` et n'affiche
  plus les membres de l'agence précédente.
- [x] AC2 — Les invalidations par préfixe (`['admin-users', 'list']`, `['admin-users']`) restent
  valables : tests existants de `TeamConsole` verts.

## Hors périmètre

- P197.04 et P197.05 : à valider.

## Notes d'implémentation

- Test : `takussan-web/src/components/admin/__tests__/TeamConsole.changement-d-agence.tck-1901.test.tsx`.
  Avant correctif : rouge, la ligne de la nouvelle agence n'apparaît jamais (une seule lecture).
- Ablation : clé sans agence remise → rouge ; correctif remis → vert.

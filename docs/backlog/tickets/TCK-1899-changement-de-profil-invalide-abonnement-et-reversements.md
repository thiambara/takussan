---
id: TCK-1899
title: "Un changement de profil réussi invalide l'abonnement et les reversements plateforme lus par les relais `/api/me/*`"
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
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-197--clés-tanstack-query-des-lectures-de-lagence-active-face-au-changement-de-profil"
tags: [web, profils, tanstack-query, billing, pistes]
---

## Objectif

Après un changement de profil réussi, `/app/agency/billing` relit l'abonnement et les reversements
plateforme de la nouvelle agence au lieu d'afficher ceux de l'agence quittée.

## Contexte

Réf : **P197.01** du fichier de pistes, `retenu · autonome` (A1).

- `AgencyBillingClient` lit sous `['me', 'subscription']`, `AgencyPayoutsClient` sous
  `['me', 'payouts']`, par les relais du front qui posent `X-Active-Profile-Hint` depuis le cookie
  du profil actif : la réponse est celle de l'agence active, la clé ne la porte pas.
- `useSwitchActiveProfile` n'invalidait que `['me', 'profiles']`, `['roles']` et `['permissions']`,
  et `router.refresh()` laisse les composants montés : les données de l'agence quittée restaient
  jusqu'au `staleTime` de 5 min.
- Contrat écrit : TCK-143 (« l'agence courante reflète le nouveau profil sans recharger la page »).

## Hypothèses (mode sans humain)

- L'invalidation se fait sur le seul changement **réussi** (`onSuccess`) : un échec ne change pas
  de profil.
- Le point unique d'invalidation au changement de profil (P197.05) reste hors du correctif : il
  est à valider (V6).

## Delta à produire

- [x] `useSwitchActiveProfile` (`takussan-web/src/hooks/useProfiles.ts`) invalide
  `['me', 'subscription']` et `['me', 'payouts']` après un changement réussi.
- [x] Test Vitest du hook.

## Critères d'acceptation

- [x] AC1 — Après un `PATCH /api/me/active-profile` en 200, les deux requêtes sont marquées
  périmées (`isInvalidated`).

## Hors périmètre

- P197.04 et P197.05 (clés des lectures faites par le navigateur, point unique d'invalidation) :
  à valider.

## Notes d'implémentation

- Test : `takussan-web/src/hooks/__tests__/useSwitchActiveProfile.lectures-d-agence.test.tsx`.
  Avant correctif : rouge, mutation réussie mais `isInvalidated` à `false`.
- Ablation : correctif retiré → 1 rouge ; remis → vert.

---
id: TCK-1903
title: "L'écran des intégrations est remonté au changement de profil : il n'affiche plus les intégrations de l'agence quittée"
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
tags: [web, profils, integrations, pistes]
---

## Objectif

Après un changement de profil vers une autre agence, `/app/agency/integrations` affiche les
intégrations (et leurs adresses de notification) de la nouvelle agence.

## Contexte

Réf : **P197.03** du fichier de pistes, `retenu · autonome` (A1).

- La page lit les intégrations par `fetchIntegrationsAction()`, qui passe le profil actif du
  cookie ; `IntegrationsManager` copie la liste dans `useState(initialIntegrations)`, et
  `IntegrationWebhookEndpoint` copie de même son adresse.
- `router.refresh()` rend la page sous le nouveau profil sans la démonter : sans `key`, l'état
  local ignorait la nouvelle liste.
- Contrat écrit : TCK-143 (l'agence courante reflète le nouveau profil sans recharger la page).

## Hypothèses (mode sans humain)

- La clé est le profil actif lu dans le cookie (`getActiveProfileId()`), celui-là même sous lequel
  `fetchIntegrationsAction` lit : la page n'a pas l'agence sous la main, et le profil la détermine.
  Sans profil (impersonation, ou cookie absent), la clé est constante, comme la lecture.

## Delta à produire

- [x] `integrations/page.tsx` lit le profil actif et le pose en `key` d'`IntegrationsManager`.
- [x] Test Vitest de la page rendue sous un profil, puis rerendue sous un autre.
- [x] Le test de page existant simule `@/lib/session`.

## Critères d'acceptation

- [x] AC1 — Rerendue sous un autre profil, la page n'affiche plus les intégrations du premier et
  affiche celles du second.

## Hors périmètre

- Le relevé des autres `useState(initial…)` des pages dont la lecture porte l'indice : reste de la
  piste.
- P197.04 et P197.05 : à valider.

## Notes d'implémentation

- Test : `takussan-web/src/app/(dashboard)/app/agency/integrations/__tests__/page.changement-de-profil.tck-1903.test.tsx`
  (vrai `IntegrationsManager`). Avant correctif : rouge, la carte Wave de l'agence quittée reste.
- Ablation : `key` retirée → rouge ; remise → vert.
- Piège : `getActiveProfileId()` lit `cookies()`, qui jette hors d'une requête ; tout test de la
  page doit simuler `@/lib/session`.

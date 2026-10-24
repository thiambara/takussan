---
id: TCK-2163
title: "La Gate des capacités juge un compte à son propre profil actif, jamais à celui que la requête porte pour un autre compte"
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-203--agence-dun-compte-lue-hors-requête-http"
tags: [api, authorization, capabilities, pistes]
---

## Objectif utilisateur

Un `$tiers->can('<capacité>')` écrit dans une requête juge le tiers dans son agence, et non
dans celle du profil actif de l'appelant.

## Contexte

Réf : **P203.04** du fichier de pistes, `validé`. Sans agence en contexte, la Gate de chaque
`Capability` (`AppServiceProvider::bootGatesAndPolicies()`) prenait
`request()->activeProfile()->agency_id` sans vérifier que ce profil était celui de `$user`.
`HasProfiles::activeProfile()` fait cette vérification. Défaut latent : aucun appelant
d'aujourd'hui ne juge une capacité pour un tiers.

## Décision du porteur

> validation du porteur (2026-10-24) : la Gate lit `$user->activeProfile()` au lieu du profil actif de la requête, avec un test sur un tiers

## Hypothèses (mode sans humain)

- Pour l'appelant lui-même, `$user->activeProfile()` rend le même profil que la requête : rien ne change.
- Hors requête, `activeProfile()` rend `null` comme avant (`app()->bound('request')` est déjà jugé dedans).

## Delta à produire

- [x] La Gate lit `$user->activeProfile()` ; commentaire de l'ordre de résolution mis à jour.

## Critères d'acceptation

- [x] AC1 — Requête portant le profil d'un agent de A : `$agentDeB->can('properties.create')` est vrai (jugé dans B, son agence unique).
- [x] AC2 — L'appelant reste jugé à son profil actif (compte de deux agences, profil actif dans A).

## Notes d'implémentation

- Ablation : `request()->activeProfile()` remis → AC1 rouge ; remis → 2 verts. Retirer l'étape 2 en entier laisse AC2 vert : l'accesseur `$user->agency_id` (étape 3) dérive lui aussi du profil actif du compte, l'étape 2 n'ajoute rien pour l'appelant.

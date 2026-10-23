---
id: TCK-1858
title: "La délégation de rôle rend 422, et non 500, sur un `user_id` non entier ou hors de `bigint`"
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
    - "docs/features.md#22-rôles--permissions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-188--paramètres-de-date-et-de-nombre-lus-à-la-main-hors-de-filter"
tags: [api, permissions, validation, pistes]
---

## Contexte

Réf : **P188.03** du fichier de pistes, `retenu · autonome` (A1). `StoreRoleDelegationRequest`
juge `user_id` par `integer` (Laravel saute alors `exists`), mais son rappel `after()` appelle
`validateBeneficiaryInAgency()`, qui fait `User::find()` sur la valeur brute : `user_id=abc` →
500 `22P02`, `user_id` à 20 chiffres → 500 `22003`.

## Objectif utilisateur

Un administrateur d'agence qui délègue un rôle avec un bénéficiaire mal formé reçoit une erreur
de validation sur `user_id`.

## Contrat de données

`POST /api/agencies/{agency}/role-delegations` : mêmes champs ; un `user_id` refusé par ses règles
rend 422 au lieu de 500. Qui peut déléguer, et à qui, ne change pas.

## Delta à produire

- [x] `StoreRoleDelegationRequest::withValidator()` : sortir du rappel quand `user_id` porte déjà
  une erreur.
- [x] Test : `RoleDelegationTest::test_un_user_id_non_entier_rend_422_et_non_500`.

## Critères d'acceptation

- [x] AC1 — `user_id=abc` → 422 sur `user_id`.
- [x] AC2 — `user_id=99999999999999999999` → 422 sur `user_id`.
- [x] AC3 — les refus existants (soi-même, hors agence, durée) rendent toujours 422.

## Hors périmètre

- Les autres contrôles du rappel, inchangés quand `user_id` passe ses règles.

## Notes d'implémentation

- Reproduction : le test neuf rouge avant correctif (`abc` → 500).
- Ablation : requête remise à l'état de `pre-dev` → 1 rouge ; correctif remis → 1 vert
  (6 assertions). `RoleDelegationTest` entier 15 verts.

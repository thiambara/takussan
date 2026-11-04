---
id: TCK-1019
title: "UserResource omet les clés de 2FA, de vérification et de préférences qu'un sparse fieldset n'a pas lues"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#1-user"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-58--colonnes-absentes-du-sparse-fieldset--relation-valeur-par-défaut-ou-null-à-la-place"
tags: [api, resources, sparse-fieldsets, pistes]
---

## Contexte

Réf : **P58.04** du fichier de pistes, `validé` (V2 accordé). Sous un sparse fieldset
(`GET /api/agencies/{id}/members?fields[users]=…`), `UserResource` émettait `two_factor_enabled`,
`force_2fa_at_first_login`, `force_2fa_reconfigure` à `false`, `email_verified_at` et
`phone_verified_at` à `null`, et `preferences` à `{}`, quelle que soit la base : ces colonnes sont
hors `User::$queryFields`. C'est le défaut que TCK-272 a corrigé pour `has_usable_password` seul.
Re-mesuré le 2026-10-20 sur `pre-dev` 35d861d57 par le test de garde ci-dessous : avant correctif,
`two_factor_enabled` est émis sous le fieldset.

## Décision du porteur

> `whenHas` sur les clés dérivées de colonnes hors `$queryFields` (`two_factor_enabled`, `force_2fa_*`, `email_verified_at`, `phone_verified_at`, `preferences`), sur le modèle de `has_usable_password` ; `UserResourceSparseFieldsTest` étendu, avec ablation (porteur, 2026-10-19)

## Objectif

Une clé de `UserResource` dont la colonne n'a pas été lue est absente, jamais inventée.

## Delta à produire

- [x] `UserResource` : `whenHas` sur `email_verified_at`, `phone_verified_at`,
      `two_factor_enabled`, `force_2fa_at_first_login`, `force_2fa_reconfigure` (colonne
      `metadata`) et `preferences`.
- [x] `UserResourceSparseFieldsTest` : un test d'omission sous fieldset, un test de présence et de
      justesse sur le modèle entier.

## Critères d'acceptation

- [x] AC1 — Membre aux drapeaux vrais, liste sous `fields[users]=id,first_name,last_name,email,status` :
      aucune des six clés n'est émise.
- [x] AC2 — Même membre, liste sans fieldset : les six clés sont là et disent vrai
      (`preferences` = `{x: 1}`).

## Hypothèses (mode sans humain)

- `force_2fa_reconfigure` dépend de la colonne `metadata` : c'est elle que juge `whenHas`.
- Les autres points d'émission (`/api/auth/me`, connexion, inscription, OAuth, `PATCH /api/me`)
  rendent un modèle entier (`fresh()`, `$request->user()` ou modèle lu par `where`) : la clé y
  reste toujours présente. Relu, et rejoué sur sept classes d'authentification et d'onboarding.

## Hors périmètre

- Les types du front (`takussan-web/src/types/user.ts:76-78`) déclarent encore
  `email_verified_at`, `phone_verified_at` et `two_factor_enabled` non optionnels ; aucun appelant
  de la liste sous fieldset ne les lit (P58.04, Constat). Le lot est côté API.

## Notes d'implémentation

- Avant correctif : rouge, `two_factor_enabled` émis sous le fieldset.
- Ablation 1 (ressource remise à l'état de `pre-dev`) → rouge, même message.
- Ablation 2 (`whenHas` retiré sur `preferences` seul) → rouge, `preferences` émis. Remis →
  `UserResourceSparseFieldsTest` 4 verts.

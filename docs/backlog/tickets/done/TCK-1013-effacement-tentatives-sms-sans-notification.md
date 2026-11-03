---
id: TCK-1013
title: "L'effacement retire le numéro des tentatives SMS sans notification"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-57--téléphones-et-e-mails-hors-de-users-face-à-lanonymisation"
tags: [api, rgpd, sms, pistes]
---

## Contexte

Réf : **P57.01** du fichier de pistes, `validé` (V3). Depuis TCK-799, un SMS envoyé sans
`notification_id` (code de vérification du téléphone, step-up, signature de bail) écrit une
tentative avec `app_notification_id = null` et `to` = le numéro. `AccountDeletionService::anonymize()`
n'efface `to` que sur les tentatives liées à une notification du compte (TCK-691) : le critère AC1
de TCK-691 (« aucune tentative ne porte le numéro du compte ») ne tient plus. Re-mesuré le
2026-10-19 sur `pre-dev` 5cd62d286 par le test ci-dessous, avant correctif : 2 tentatives au
numéro du compte après `executeDeletion()`.

## Décision du porteur

> effacer à l'anonymisation le `to` des tentatives sans notification qui visent le `phone` ou le `secondary_phone` du compte, relevés avant le `forceFill`, sans migration ni colonne `user_id` ; un test dans `AccountDeletionExecuteTest`, avec ablation (porteur, 2026-10-19)

## Objectif

Après l'effacement, aucune tentative sans notification ne porte le `phone` ni le `secondary_phone`
du compte.

## Delta à produire

- [x] `AccountDeletionService::anonymize()` : relever `phone` et `secondary_phone` avant le
      `forceFill`, puis mettre `to` à `null` sur les tentatives `app_notification_id IS NULL`
      dont `to` est l'un d'eux (tel qu'enregistré, et sans espaces).
- [x] `AccountDeletionExecuteTest::test_execute_efface_le_numero_des_tentatives_sans_notification`.

## Critères d'acceptation

- [x] AC1 — Un envoi OTP par `SmsDriverInterface` au `phone` du compte, et une tentative sans
      notification à son `secondary_phone` : après `executeDeletion()`, aucune ne porte ces
      numéros ; la tentative reste.
- [x] AC2 — Une tentative sans notification à un autre numéro garde son `to`.

## Hypothèses (mode sans humain)

- `to` est écrit par `PhoneNumber::normalize()`, qui ne retire que les espaces (lu) : le filtre
  compare le numéro enregistré et sa forme sans espaces.

## Hors périmètre

- Un ancien numéro remplacé avant l'effacement : le retrouver demanderait une colonne `user_id`
  (migration), écartée par le porteur. La purge à 90 jours le retire.

## Notes d'implémentation

- Avant correctif : 1 rouge (`2 is identical to 0`). Ablation : le filtre `whereIn('to', …)`
  remplacé par une valeur qui ne vise rien → 1 rouge, 8 verts ; correctif remis → 9 verts.

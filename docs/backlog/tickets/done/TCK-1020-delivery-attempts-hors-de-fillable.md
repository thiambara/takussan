---
id: TCK-1020
title: "La colonne héritée app_notifications.delivery_attempts ne s'écrit plus par affectation de masse"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md#12-appnotification-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-58--colonnes-absentes-du-sparse-fieldset--relation-valeur-par-défaut-ou-null-à-la-place"
tags: [api, notifications, sms, pistes]
---

## Contexte

Réf : **P58.05** du fichier de pistes, `validé` par le porteur sur la recommandation du délégué (A3).
`app_notifications.delivery_attempts` (jsonb) n'a plus d'écrivain depuis TCK-110, qui l'a
remplacée par la table `notification_delivery_attempts` ; elle restait pourtant dans `$fillable`
d'`AppNotification`. Re-mesuré le 2026-10-20 sur `pre-dev` 35d861d57 par le test de garde
ci-dessous : avant correctif, un `update(['delivery_attempts' => …])` écrit la colonne, numéro
compris.

## Décision du porteur

> retirer seulement `delivery_attempts` de `$fillable` ; le retrait de la colonne attend une mesure de la préproduction et reste au porteur (porteur, 2026-10-19)

## Objectif

Aucun appelant ne réécrit la colonne héritée par affectation de masse.

## Delta à produire

- [x] `AppNotification::$fillable` : `delivery_attempts` retiré (le `$casts` reste, la commande de
      reprise lit la colonne par `getAttribute`).
- [x] `NotificationDeliveryAttemptsTableTest::test_la_colonne_json_heritee_ne_s_ecrit_plus_par_affectation_de_masse`.

## Critères d'acceptation

- [x] AC1 — `update(['delivery_attempts' => …])` laisse la colonne à `null` en base.
- [x] AC2 — La commande `sms:backfill-delivery-attempts` reste verte sur son test (la factory est
      non gardée).

## Reste à faire

Le retrait de la colonne (migration), de son `$casts` et de la commande de reprise, après un
`select count(*) filter (where delivery_attempts is not null)` en préproduction : décision du
porteur.

## Hors périmètre

- Toute migration (V4) : voir « Reste à faire ».

## Notes d'implémentation

- Avant correctif : rouge, la colonne vaut `[{"to": "+221771111111", "attempt": 1}]`.
- Ablation (clé remise dans `$fillable`) → rouge ; remise hors → `NotificationDeliveryAttemptsTableTest`
  5 verts.

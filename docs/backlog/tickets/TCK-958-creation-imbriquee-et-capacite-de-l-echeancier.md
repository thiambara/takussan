---
id: TCK-958
title: "Création imbriquée d'une ligne de bail : ni caution rendue ni montant nul, et l'échéancier jugé par payments.record"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-46--voies-décriture-en-double-sur-largent"
tags: [back, leases, payments, authorization, pistes]
---

## Contexte

Réf : **P46.05** du fichier de pistes (« Petites améliorations » de l'angle 46), `validé` par le
porteur (critères accordés : V1 et V8).

`StoreLeasePaymentRequest` admettait `payment_type=deposit_refund` et `amount=0` (`min:0`) : la
ligne naissait `pending`, rattachée à aucun reversement, et `mark-paid` la refuse. Elle restait
due pour toujours. `generate-schedule` jugeait par `update`, et non par `recordPayment` comme la
création d'une ligne : un agent sans `payments.record` écrivait l'échéancier.

## Décision du porteur

refuser `deposit_refund` et `amount=0` à la création imbriquée, et juger `generate-schedule` par `recordPayment` (`payments.record`) ; reste : les helpers de `/api/payments`, route retirée en session avec P46.01

## Reste à faire

les helpers de `/api/payments`, route retirée en session avec P46.01

## Objectif

Aucune ligne de bail ne naît sans pouvoir être réglée, et l'échéancier s'écrit sous la même
capacité qu'une échéance.

## Hypothèses (mode sans humain)

- « Refuser `amount=0` » : `gt:0`, comme le faisait `/api/payments`. Un montant négatif était déjà
  refusé par `min:0`.

## Delta à produire

- [x] `StoreLeasePaymentRequest` : `amount` `gt:0` ; `payment_type` sans `deposit_refund`
  (`Rule::enum(...)->except(...)`).
- [x] `LeaseController::generateSchedule` : `authorize('recordPayment', $lease)`.
- [x] `LeasePaymentNestedCreationRulesTest`.

## Critères d'acceptation

- [x] AC1 — `deposit_refund` → 422 sur `payment_type`, aucune ligne.
- [x] AC2 — `amount=0` → 422 sur `amount`, aucune ligne.
- [x] AC3 — `rent`, `charges`, `deposit`, `regularization`, `penalty` restent acceptés.
- [x] AC4 — `generate-schedule` : agent sans `payments.record` → 403, aucune ligne ; agent du rôle
  système → 200.

## Hors périmètre

- Les helpers de `PaymentController` (`authorizeBookingManage`, `authorizeLeaseManage`) : la
  route `/api/payments` est retirée par TCK-940 (PR #666).

## Notes d'implémentation

- Avant correctif : 3 rouges (201 au lieu de 422 deux fois, 200 au lieu de 403).
- Ablation : les deux fichiers de `app/` remis à leur état d'avant → les 3 mêmes rouges ; remis →
  verts.

---
id: TCK-1920
title: "La création à la main d'une échéance de bail ne prend plus de loyer ni de caution, et son montant est borné à la colonne"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#15-leasepayment-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-170--montants-envoyés-par-le-navigateur-et-pris-tels-quels-par-lapi"
tags: [api, leases, payments, pistes]
---

## Contexte

Réf : **P170.04** du fichier de pistes, `validé` (V1 et V7 accordés). `POST /api/leases/{id}/payments`
prenait tout montant (`numeric|gt:0`) quel que soit `payment_type` : un loyer de 1, un second loyer
de 400 000 sur une période déjà échue et une caution de 5 passaient (201, `pending`), payables en
ligne par le locataire. Le front n'appelle plus cette route (`leases.ts`, TCK-681).

## Décision du porteur

garder la route pour `charges`, `regularization` et `penalty` seulement, refuser `rent` et `deposit` en 422 codé, borner `amount` au maximum de la colonne

## Hypothèses (mode sans humain)

- Le maximum de la colonne `lease_payments.amount` (`decimal(14,2)`) est `CurrencyUnit::MAX_COLUMN`
  (`999999999999.99`), la borne déjà lue par les factures et les interventions ; le dépassement
  rend une erreur de validation sur `amount`.
- `deposit_refund` reste refusé par la validation (TCK-958).

## Delta à produire

- [x] `StoreLeasePaymentRequest` : `amount` `max:` `CurrencyUnit::MAX_COLUMN`.
- [x] `LeasePaymentController::store` : `rent` et `deposit` → 422 `lease_payment.type_from_schedule` (fr, en ; wo = fr).
- [x] `LeasePaymentNestedCreationRulesTest` (types acceptés, types refusés, borne) ; `LeaseTest` crée des charges au lieu d'un loyer.

## Critères d'acceptation

- [x] AC1 — `rent` de 1 et `deposit` de 5 sur un bail actif → 422 `lease_payment.type_from_schedule`, aucune ligne.
- [x] AC2 — `charges`, `regularization`, `penalty` → 201.
- [x] AC3 — `amount` de 999 999 999 999 999 → 422 sur `amount` (au lieu d'une 500) ; 999 999 999 999,99 → 201.

## Hors périmètre

- Le retrait de la route (écarté par la décision).
- Le rapport d'une pénalité ou d'une régularisation au loyer du bail.

## Notes d'implémentation

- Ablation : contrôleur et FormRequest remis → 2 rouges sur 6 (201 sur `rent`, 500 sur le grand nombre) ; remis → 6 verts.

---
id: TCK-1421
title: "Rapprochement : le virement de clôture de la plateforme (PlatformPayout payé) se rapproche d'un crédit du relevé"
status: done
phase: P2
family: applicatif
estimate: M
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1415]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#41-bankstatementline-"
    - "docs/models-spec.md#45-platformpayout-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-141--encaissements-soldés-par-la-plateforme-face-au-relevé-bancaire-de-lagence"
tags: [api, front, rapprochement, plateforme, migration, pistes]
---

## Contexte

Réf : **P141.02** du fichier de pistes, `validé`.

Depuis TCK-1415, un encaissement de la plateforme ne se rapproche plus seul d'un crédit. Le
virement net que la plateforme verse ensuite à l'agence n'était, lui, candidat d'aucun crédit :
`PlatformPayout` n'était dans aucune liste de types, et `platform_payouts` n'avait pas les colonnes
de rapprochement. Le crédit restait `unmatched`, et seul « ignorer » le sortait de la liste.

## Décision du porteur

« validé — porteur (2026-10-22) : le `PlatformPayout` `paid` devient candidat d'un crédit au `net_amount`, dans une fenêtre autour de `processed_at`, avec la règle de référence sur `payment_reference` (colonnes neuves, V4) »

Critères accordés : V1, V4.

## Objectif

Le crédit du virement de la plateforme se suggère, se cherche et se confirme, une seule fois, sur
le `PlatformPayout` payé.

## Delta à produire

- [x] Migration neuve `2026_10_22_174000_add_bank_reconciliation_to_platform_payouts_table` :
      `bank_reconciled_at`, `bank_statement_line_id` (FK `nullOnDelete`), index unique partiel ;
      `down()` qui les retire. Mêmes colonnes que `payouts`.
- [x] `PlatformPayout` : colonnes remplissables, cast `datetime`.
- [x] `ReconciliationMatcher` : sur un crédit, candidats `PlatformPayout` `paid`, non rapprochés,
      de l'agence et de la devise, au `net_amount` exact, `processed_at` à ±7 jours ;
      `payment_reference` porte la règle de référence (95).
- [x] `PaymentSearchService` : recherche des `PlatformPayout` sur un crédit (référence, montant).
- [x] `ReconciliationManager` : type admis, garde de sens (un crédit), garde `paid` (422
      `platform_payout_not_paid`), agence, montant attendu `net_amount`.
- [x] Type `platform_payout` dans `MatchBankStatementLineRequest`, `BankStatementLineController`,
      `BankStatementLineResource`, `PaymentSearchService::TYPE_MAP` ; front : `MatchedPaymentType`
      et le libellé `admin.reconciliation.paymentTypes.platform_payout` (fr, en ; `wo` = texte
      français, wolof en pause).
- [x] Tests : `PlatformSettledReconciliationTest`.

## Critères d'acceptation

- [x] AC1 — Virement net 142 500 payé le 2026-05-02, référence `VIR-PLAT-1` ; crédit 142 500 au
      2026-05-03 de même référence → suggéré à 95, cherché, confirmé (`bank_reconciled_at`
      2026-05-03, `matched_payment_type = platform_payout`).
- [x] AC2 — Une seconde ligne identique : ni suggérée, ni cherchée, 422 à la confirmation ; défaire
      le rapprochement libère le virement.
- [x] AC3 — Un virement non payé, hors fenêtre ou d'une autre agence n'est pas candidat ; un
      virement approuvé non payé → 422 (`payment_id`).
- [x] AC4 — Un débit ne se rapproche pas d'un virement de la plateforme (422, `payment_type`).

## Hors périmètre

- La seconde voie de la `Piste` (un rapprochement qui solde d'un coup les échéances rattachées) :
  non retenue par la décision.
- `docs/models-spec.md` § 45 ne décrit pas encore les deux colonnes neuves : à reporter par
  `/sync-specs` (la spec est fermée à l'implémenteur).

## Notes d'implémentation

- `platform_payouts_unique_open_period` (agence, `period_end`) refuse deux reversements ouverts sur
  la même fin de période : les fabriques du test fixent chacune leur période.
- Ablation : `app/` et `lang/` remis à l'état d'avant (migration gardée) → 2 rouges (AC1, AC3) ;
  correctif remis → 10 verts. AC4 était déjà tenu (type refusé par la requête) : il garde la
  garde de sens une fois le type admis.

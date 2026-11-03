---
id: TCK-2174
title: "La pénalité de retard réglée est une ligne du reversement au bailleur et de son relevé"
status: done
phase: P2
family: full
estimate: M
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#15-leasepayment-"
  adr:
    - "docs/adr/0039-les-sorties-d-argent.md#6-la-pénalité-de-retard-réglée-est-une-ligne-du-reversement-p20601-rappel-de-tck-594"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-206--pénalités-de-retard-réglées-face-aux-lecteurs-de-largent"
tags: [api, web, reversements, paiements, pistes]
---

## Objectif

La pénalité de retard réglée revient au bailleur, comme TCK-594 l'a retenu : elle devient une ligne
propre du calcul du reversement (préparation, création, relevé de gérance), au mois de
`late_fee_paid_at`, à la commission du bail.

## Contexte

Réf : **P206.01** du fichier de pistes, `validé`.

### Décision du porteur

> validé — validation du porteur (2026-10-24) : TCK-594 et ADR-0039, amendement du 2026-10-24 : la pénalité réglée dont `late_fee_paid_at` tombe dans la période devient une ligne propre du calcul du reversement, au taux de commission du bail ; éligibilité par une colonne nullable `lease_payments.late_fee_payout_id`, avec des colonnes de copie (montant, taux, commission) qui la figent ; le relevé suit par le calculateur

- `PayoutCalculator` ne lisait que `montant − refund_amount` des pièces : la pénalité réglée, posée
  sur la ligne du loyer (`late_fee_amount`, `late_fee_paid_at`), n'entrait nulle part.
- La règle détaillée est écrite à ADR-0039, amendement du 2026-10-24, point 6.

## Hypothèses (mode sans humain)

- La création cite la pénalité par un champ neuf, `late_fee_lease_payment_ids` (les lignes de loyer
  dont la pénalité est reversée), à côté de `lease_payment_ids` : l'éligibilité étant propre à la
  pénalité, une pénalité réglée après le reversement de son loyer se cite seule.
- La pénalité suit les types de pièces reversables (`PayoutCalculator::LEASE_TYPES`) : une pénalité
  posée sur une caution n'est pas reversée.
- « Réglée dans un checkout de la plateforme » se lit comme la clôture
  (`PlatformPayoutService::lateFeeSettledWith` sur l'entrée qui a soldé le loyer), exposé par
  `lateFeeSettledByPlatform()`. Réglée à l'agence, la pénalité d'un loyer encaissé par la
  plateforme est reversable aussitôt.
- Le relevé relit le taux copié (`late_fee_payout_commission_rate`), comme les pivots (TCK-2017) ;
  le montant reste `late_fee_amount`, qui ne change pas après la prise tant que P206.04 (la part
  remboursée) n'existe pas.

## Delta à produire

- [x] Migration neuve, en ajout seul : `lease_payments.late_fee_payout_id` (FK `payouts`, indexée),
  `late_fee_payout_amount`, `late_fee_payout_commission_rate`, `late_fee_payout_commission_amount`.
- [x] `PayoutCalculator::lateFees()`, `whereLateFeeSettled()`, `exceptLateFeesAwaitingPlatform()` ;
  `compute()` rend `lines.late_fees` et les compte au brut et à la commission.
- [x] Préparation et relevé (JSON, PDF par bien, CSV) lisent les lignes de pénalité.
- [x] `POST /api/payouts` : `late_fee_lease_payment_ids` ; périmètre, réglement et attente de la
  plateforme jugés avant écriture, relus sous le verrou du bail (409 si déjà prise) ; les quatre
  colonnes posées à la création, remises à nul par l'annulation et l'échec.
- [x] Front : le dialogue de création montre la ligne « Pénalité de retard — bail … » et la cite.

## Critères d'acceptation

- [x] AC1 — Loyer de 150 000 réglé avec 7 500 de pénalité et loyer de 100 000, bail à 10 % :
  préparation `257 500 / 25 750 / 231 750`, relevé `257 500` ; création sur le premier loyer et sa
  pénalité → brut 157 500, net 141 750, copie `7 500 / 10 / 750`.
- [x] AC2 — La pénalité prise n'est plus proposée, et la citer à nouveau rend 409.
- [x] AC3 — Le relevé d'un reversement versé garde la commission copiée quand le taux du bail change.
- [x] AC4 — Une pénalité réglée le mois suivant le reversement de son loyer se reverse seule (brut
  7 500, net 6 750).
- [x] AC5 — Un reversement annulé rend la pénalité : quatre colonnes nulles, de nouveau proposée.
- [x] AC6 — Pénalité due, ou d'une autre agence : 422 sur `late_fee_lease_payment_ids`.
- [x] AC7 — Pénalité réglée dans un checkout de la plateforme : ni proposée ni acceptée avant que
  son `PlatformPayout` soit `paid`.

## Hors périmètre

- La part de pénalité remboursée (`late_fee_refund_amount`) et sa reprise : P206.04, avec P205.01.
- L'Encaissé des tableaux de bord et les pénalités à recouvrer : P206.02, P206.03.
- `docs/features.md:218` et ADR-0039 § 3 : reste de P206.05 (chemins fermés à l'implémenteur).

## Notes d'implémentation

- Tests : `takussan-api/tests/Feature/Api/PayoutLateFeeTest.php` (5 cas),
  `takussan-web/src/components/payments/__tests__/CreatePayoutDialog.test.tsx` (1 cas neuf).
- Avant correctif : 5 rouges (pas de `lines.late_fees`, brut 250 000).
- Ablation : `compute()` sans lignes de pénalité → 4 rouges ; `detachItems` sans la remise à nul
  → 1 rouge (AC5) ; payload du dialogue sans `late_fee_lease_payment_ids` → 1 rouge. Remis → verts.
- Piège : le drapeau `late_fee_included` qui compte pour la clôture est celui de l'entrée de
  checkout qui a soldé le loyer (`metadata.gateway.transactions`), pas celui du haut de `metadata`.

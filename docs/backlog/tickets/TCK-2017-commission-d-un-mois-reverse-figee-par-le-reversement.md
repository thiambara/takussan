---
id: TCK-2017
title: "La commission d'un mois déjà reversé reste celle que le reversement a retenue, copiée ligne par ligne dans le pivot"
status: done
phase: P1
family: applicatif
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-177--relevés-de-gérance-dune-période-close-recalculés-à-chaque-lecture"
tags: [api, payouts, relevé, migration, pistes]
---

## Objectif utilisateur

Le bailleur qui relit le relevé d'un mois déjà reversé y lit la commission que l'agence a
réellement retenue sur ce reversement, même si l'agence a changé son taux depuis. Le net du
relevé rejoint alors le versé.

## Contexte

Réf : **P177.02** du fichier de pistes. La copie par ligne est celle que décide la précision de
**P177.01** ; P177.01 elle-même est reclassée au porteur dans le même passage (la ligne négative
datée d'un remboursement n'a pas de date à lire, voir sa ligne `Mesure`).

## Décision du porteur

> validé — validation du porteur (2026-10-23) : la piste telle qu'écrite, sur la copie par ligne de P177.01, dans le même ticket

Précision de P177.01, pour la copie : « copie par ligne dans le pivot `payout_lease_payment`
(montant, taux, commission, colonnes additives) posée à la création du reversement ».

## Hypothèses (mode sans humain)

- La copie porte trois colonnes nullables, sur les deux pivots (`payout_lease_payment` et
  `payout_booking_payment`, l'acompte de séjour étant reversé par le même chemin) : `amount`,
  `commission_rate`, `commission_amount`, aux types de `payouts` et de `agencies.commission_rate`.
- Une ligne de pivot antérieure à la migration n'a pas de copie : elle se lit comme avant (taux
  du jour). Aucune reprise de données.
- Le relevé relit le **taux** retenu, appliqué au montant gardé du jour (`montant − refund_amount`,
  TCK-1214). Sans remboursement, la commission rendue est exactement la commission copiée. La
  lecture des montants copiés et la ligne négative d'un remboursement sont P177.01, reclassée.
- `commission_rate_source` garde son sens (`lease` ou `agency`) : le taux retenu vient de l'une
  de ces deux sources, et le front n'en connaît pas d'autre (`types/invoice.ts:171`).

## Delta à produire

- [x] Migration additive `2026_10_24_010000_add_line_copy_to_payout_pivots`, avec son `down()`.
- [x] `PayoutService::createLocked()` attache chaque pièce avec sa copie (lignes de `compute()`).
- [x] `PayoutCalculator::compute()` accepte les taux retenus par id de pièce.
- [x] `OwnerStatementService` relit les taux des reversements qui portent les pièces de la période.
- [x] Garde dans `tests/Feature/Api/OwnerStatementTest.php`.

## Critères d'acceptation

- [x] AC1 — Un reversement créé par `POST /api/payouts` écrit, pour chaque pièce, le montant, le
  taux et la commission retenus dans son pivot.
- [x] AC2 — Bail sans taux propre, agence à 8 %, reversement `completed` (loyer, charges, acompte
  de séjour) ; agence passée à 12 % → le relevé du mois garde la commission retenue (21 600) pour
  ces pièces, et applique 12 % à la seule pièce de la période pas encore reversée.

## Hors périmètre

- La lecture des montants copiés et la ligne négative datée d'un remboursement postérieur
  (P177.01, reclassée au porteur dans ce passage).
- P177.03 (ventilation du versé et des frais) et P177.05 (relevé figé) : leurs précisions les
  placent après P177.01.

## Notes d'implémentation

- Reproduit sur `c7f6c4101` : le test rendait 33 600 de commission (12 % du jour) au lieu de 21 600.
- Ablation : la lecture des taux retirée du relevé → commission 33 600, net 246 400, rouge ; la
  copie retirée de `createLocked` (attache nue) → la ligne de pivot attendue manque, rouge.
  Rétabli → vert.

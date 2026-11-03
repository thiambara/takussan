---
id: TCK-2176
title: "L'Encaissé et les métriques plateforme comptent la pénalité de retard réglée"
status: done
phase: P2
family: back
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  adr:
    - "docs/adr/0057-instantanes-quotidiens-des-metriques-plateforme.md#amendement-du-2026-10-24--la-pénalité-de-retard-réglée-est-encaissée-les-pénalités-à-recouvrer-se-comptent-à-part"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-206--pénalités-de-retard-réglées-face-aux-lecteurs-de-largent"
tags: [api, tableau-de-bord, metriques, paiements, pistes]
---

## Objectif

L'*Encaissé* (ADR-0057 § 2) compte la pénalité de retard réglée, au jour de son règlement, chez
tous ses lecteurs ; les frais plateforme de la pénalité suivent la clôture.

## Contexte

Réf : **P206.02** du fichier de pistes, `validé`.

### Décision du porteur

> validé — validation du porteur (2026-10-24) : ADR-0057, amendement du 2026-10-24 : l'Encaissé compte la pénalité de retard réglée, datée par `late_fee_paid_at` (second agrégat) ; ses frais plateforme ne portent que sur la pénalité réglée par le checkout de la plateforme, lue ligne à ligne par `lateFeeSettledWith`, partagé avec la clôture

- `LEASE_NET_SQL` valait `amount − refund_amount`, sans la pénalité réglée sur la ligne.

## Hypothèses (mode sans humain)

- La part rendue de la pénalité (`late_fee_refund_amount`) n'existe pas encore : le second agrégat
  compte `late_fee_amount`. Le retrait de la part rendue suit P206.04 (même lot, ticket à part).
- La santé d'une agence à la console ajoute la pénalité au revenu sur 30 jours, sans la compter
  comme une transaction de plus (elle vit sur la ligne déjà comptée).
- `lateFeeSettledWith` reste privée ; la clôture et les métriques la partagent par
  `PlatformPayoutService::platformSettledLateFee(s)`, qui lit les intégrations globales une fois
  par lot.

## Delta à produire

- [x] `CollectedPayments::lateFeeIncome()` et `LATE_FEE_NET_SQL`.
- [x] `PortfolioMetrics::leaseIncomeByMonth` : les deux agrégats, chacun daté par sa colonne, en
  une seule requête (`UNION ALL`).
- [x] `PlatformMetricsSnapshotter::flowsBetween` : GMV avec la pénalité ; frais sur la seule
  pénalité réglée par le checkout de la plateforme.
- [x] `AgencyDetailController::health` : `revenue_30d` avec la pénalité.

## Critères d'acceptation

- [x] AC1 — 150 000 + 7 500 de pénalité réglée à l'agence et 100 000, à 5 % : GMV 257 500, frais
  12 500 ; `leaseIncomeByMonth` de septembre 257 500.
- [x] AC2 — Loyer réglé en août, pénalité réglée en septembre : la pénalité compte en septembre.
- [x] AC3 — Pénalité due non réglée : rien de plus.
- [x] AC4 — Pénalité réglée par le checkout de la plateforme : 375 de frais aux métriques, et
  `late_fees_fee` de la clôture vaut 375.
- [x] AC5 — `revenue_30d` de la santé d'agence : 157 500 pour un loyer de 150 000 et sa pénalité.

## Hors périmètre

- Les pénalités à recouvrer : P206.03.
- La part de pénalité remboursée : P206.04.

## Notes d'implémentation

- Test : `takussan-api/tests/Feature/Reporting/PenaliteDeRetardEncaisseeTest.php` (5 cas). Avant
  correctif : 4 rouges (GMV 250 000, revenu 150 000).
- Ablation : `lateFeeIncome()` vidé → 4 rouges ; frais de pénalité coupés → 1 rouge (AC4).
- Piège : une seconde requête dans `leaseIncomeByMonth` faisait rougir
  `DashboardQueryBudgetTest` (27 > 26). Le budget n'est pas relevé (seuil de garde) : les deux
  agrégats passent en une requête.

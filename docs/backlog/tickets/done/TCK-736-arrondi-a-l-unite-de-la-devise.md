---
id: TCK-736
title: "Facture, commission, caution et reversement : un seul arrondi, à l'unité de la devise"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#25-invoice-"
    - "docs/models-spec.md#85-commissionentry-"
    - "docs/models-spec.md#45-platformpayout-"
    - "docs/models-spec.md#14-lease-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-4--argent--montants-devises-arrondis-factures-paiements"
tags: [back, billing, invoices, commission, deposit, platform-payout, currency, pistes]
---

## Contexte

Réf : **P04.08** du fichier de pistes, `validé` par le porteur (critère accordé : V1).

`InvoiceService::create()` (TVA), `CommissionLedgerService::generateFor()` (lignes du grand
livre), `DepositRefundService::refund()` (rendu, retenue, cumul) et
`PlatformPayoutService` (clôture et détail) arrondissent au centime, quelle que soit la devise,
alors que `PaymentGatewayService::roundToCurrencyUnit()` et `PayoutCalculator` arrondissent à
l'unité de la devise (TCK-593). Une TVA de 18 % sur 100 001 XOF était facturée 18 000,18 XOF. Le
détail d'un reversement plateforme (`SUM` SQL des commissions) pouvait en outre différer de la
commission figée à la clôture (arrondie ligne par ligne).

## Décision du porteur

une seule fonction d'arrondi par devise (Currency::decimalPlacesOf) pour la facture, la commission, la caution et le reversement

## Objectif utilisateur

Une agence en XOF ne voit jamais de centimes sur une facture, une commission, une caution rendue
ou un reversement, et le détail d'un reversement retombe sur son montant.

## Contraintes strictes (métier)

- **La règle** : `Currency::roundAmount($montant, $devise)`, neuve, qui arrondit à
  `Currency::decimalPlacesOf($devise)` décimales, au plus proche, la moitié vers le haut : la règle
  de `roundToCurrencyUnit()`. Une devise inconnue garde 2 décimales (repli de `decimalPlacesOf`).
- **Hypothèse** : la commission garde son arrondi **inférieur**, écrit dans l'en-tête de
  `CommissionLedgerService` (la somme des lignes ne dépasse jamais la base). Seule la précision
  change : l'unité inférieure de la devise, prise par `decimalPlacesOf`, au lieu du centime
  inférieur. La décision du porteur nomme la fonction de précision ; elle ne demande pas de
  remplacer le plancher par l'arrondi au plus proche.
- **Hypothèse** : la devise de la facture est celle que la création retient aujourd'hui
  (`currency` saisie, sinon `XOF`). La devise par défaut de l'agence est P04.09.
- Le détail (`breakdown()`) arrondit chaque commission en SQL (`ROUND(…, n)`, la moitié loin de
  zéro, la même chose que `PHP_ROUND_HALF_UP` sur des montants positifs), puis somme, comme la
  clôture.

## Delta à produire

- [x] `App\Models\Enums\Currency::roundAmount()`.
- [x] `InvoiceService::create()` : TVA à l'unité de la devise de la facture.
- [x] `CommissionLedgerService::generateFor()` : plancher à l'unité de la devise du bail.
- [x] `DepositRefundService::refund()` : montant rendu, retenue et cumul à l'unité de la devise du
      bail.
- [x] `PlatformPayoutService::closeForAgency()` et `breakdown()` : commission ligne par ligne,
      brut, net et pénalités à l'unité de la devise du reversement.
- [x] Tests : un cas par service, dans `InvoiceStoreAuthorizationTest`, `CommissionLedgerTest`,
      `LeaseDepositRefundEndpointTest` et `PlatformPayoutScopeTest`.

## Critères d'acceptation

- [x] AC1 — Facture de 100 001 XOF à 18 % : TVA 18 000, total 118 001. En EUR : 18 000,18 et
      118 001,18.
- [x] AC2 — Commission de 100 001 XOF, négociateur à 30 % : ligne de 30 000. En EUR : 30 000,30.
- [x] AC3 — Caution XOF de 500 000, rendu saisi 300 000,40 : rendu 300 000, retenue facturée
      200 000, cumul 300 000.
- [x] AC4 — Deux réservations de 100 010 XOF à 5 % : commission 10 002 (5 001 par ligne), brut
      200 020, net 190 018, et le détail rend 200 020 / 10 002.

## Hors périmètre

- La devise par défaut d'une facture et l'affichage des décimales : P04.09.
- `PaymentGatewayService::roundToCurrencyUnit()` et `PayoutCalculator::round()` appliquent déjà la
  même règle, avec leur propre ligne : non réécrits sur `roundAmount()`.
- `LeaseService` calcule encore la commission d'une vente par `round(…, 2)` (ADR-0049 § 1, l. 83) :
  hors des quatre calculs que nomme la décision.

## Notes d'implémentation

- **Ablation** : correctif des quatre services retiré → les 4 tests neufs rouges (18 000,18 ;
  300 000,40 ; 30 000,30 ; 10 001,00), correctif remis → verts. Ablation du seul `ROUND` du
  détail (somme brute) → le test de clôture rouge sur le détail (10 001 contre 10 002).
- **Piège** : avec 100 001 XOF à 5 %, la somme brute arrondie et l'arrondi par ligne tombent sur la
  même valeur, et le test ne départage pas le `ROUND` SQL. D'où 100 010 (5 000,50 par ligne).

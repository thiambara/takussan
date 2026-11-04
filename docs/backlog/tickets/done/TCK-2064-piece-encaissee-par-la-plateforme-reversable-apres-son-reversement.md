---
id: TCK-2064
title: "Une pièce encaissée par la plateforme n'est reversable au bailleur qu'une fois son reversement plateforme payé"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models: []
  adr:
    - "docs/adr/0039-les-sorties-d-argent.md#2-qui-reçoit--payoutspayee_role"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-178--argent-encaissé-par-la-plateforme-et-reversé-au-bailleur-avant-que-lagence-lait-reçu"
tags: [api, reversements, argent, pistes]
---

## Contexte

Réf : **P178.01** du fichier de pistes (🟠, `validé`). `PayoutCalculator::leasePayments()` et
`bookingPayments()` ne lisaient ni `platform_payout_id` ni le règlement par la plateforme : un loyer
soldé par l'intégration globale, que la plateforme n'avait encore rien reversé à l'agence, était
proposé à la préparation, accepté à la création (`201`) puis versé (mesuré par le mesureur : préparation
`net 135000`, `POST /api/payouts` `201`, `mark-processed` `200`, sans aucun `PlatformPayout`).

**Décision du porteur** : validé — validation du porteur (2026-10-23) : option stricte : une pièce soldée par la plateforme n'est reversable au bailleur qu'une fois son `PlatformPayout` `paid` ; les agences `individual` restent hors règle (ADR-0039 § 2)

## Objectif utilisateur

L'agence ne reverse au bailleur que l'argent qu'elle a effectivement reçu.

## Contraintes strictes (métier)

- « Soldée par la plateforme » : la lecture de `PlatformPayoutService::isSettledByPlatform()`, en SQL
  par le scope `whereNotSettledByPlatform` (TCK-1415).
- Espèces, virement, intégration propre à l'agence : toujours éligibles.
- Agence `individual` : hors règle.
- Le relevé de gérance et l'effacement de compte continuent de compter ces pièces comme dues.

## Delta à produire

- [x] `PayoutCalculator::exceptAwaitingPlatform(Builder, Agency)` : non soldée par la plateforme, ou
  rattachée à un `PlatformPayout` `paid` ; sans effet pour une agence `individual`.
- [x] `PayoutPreparationService::prepare` : loyers et séjours filtrés.
- [x] `PayoutService::assertItemsInScope` : une pièce en attente de la plateforme rend 422
  (`lease_payment_ids` / `booking_payment_ids`, `money_out.payout.ineligible_item`).
- [x] `tests/Feature/Api/ReversementApresLaPlateformeTest.php`.

## Critères d'acceptation

- [x] AC1 — loyer soldé par la plateforme, sans `PlatformPayout` puis `approved` : absent de la
  préparation, 422 à la création ; le loyer en espèces du même bail reste proposé.
- [x] AC2 — le `PlatformPayout` passe `paid` : le loyer est proposé, et le reversement se crée (201).
- [x] AC3 — loyer soldé par l'intégration de l'agence : proposé et accepté.
- [x] AC4 — acompte de réservation soldé par la plateforme : même règle.
- [x] AC5 — agence `individual` : le loyer soldé par la plateforme reste proposé.

## Hors périmètre

- P178.03 et P178.04 (commission de la plateforme montrée, libellé « encaissé par la plateforme ») :
  validées « après P178.01 », elles restent libres pour un passage suivant.
- Un reversement déjà créé avant ce correctif n'est pas relu à l'approbation ni au versement : un
  `PlatformPayout` `paid` ne revient pas en arrière (P182.05).

## Notes d'implémentation

- Ablation : `exceptAwaitingPlatform` rendu sans effet → AC1/AC2 et AC4 rouges ; la garde
  `individual` retirée → AC5 rouge ; tout remis → 4 verts.

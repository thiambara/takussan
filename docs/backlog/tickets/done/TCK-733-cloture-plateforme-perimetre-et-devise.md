---
id: TCK-733
title: "Clôture plateforme : ne reverser que ce que la plateforme a encaissé, pénalité comprise, dans une seule devise"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#45-platformpayout-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-4--argent--montants-devises-arrondis-factures-paiements"
tags: [back, front, billing, payments, platform-payout, pistes]
---

## Contexte

Réf : **P04.05** du fichier de pistes, `validé` par le porteur (critère accordé : V1).

`PlatformPayoutService::closeForAgency()` prend tous les `BookingPayment` et `LeasePayment` `paid`
de l'agence. Il y compte aussi les espèces et ce qu'une intégration propre à l'agence a encaissé,
alors que TCK-223 décrit un reversement de ce que la plateforme a encaissé. La devise du
reversement est celle de la première ligne, sans aucun contrôle de mélange. La pénalité réglée
avec le loyer dans le même checkout n'entre pas au brut.

## Décision du porteur

paiements soldés par une intégration globale seulement, pénalité incluse, devises mélangées refusées

## Objectif utilisateur

Un super-admin qui clôture une période obtient un reversement égal à ce que la plateforme a
réellement encaissé pour l'agence, dans une seule devise.

## Contrat de données

- `POST /api/admin/payouts/close-period` :
  - avec `agency_id`, des encaissements en plusieurs devises rendent 422
    `payout.mixed_currencies` (code et texte existants, ceux de `PayoutCalculator`) ;
  - sans `agency_id`, l'agence est écartée et listée dans `excluded` avec le motif neuf
    `mixed_currencies`. La clôture globale continue (TCK-594).
- `platform_payouts.metadata` gagne `late_fees_gross` et `late_fees_fee`, figés à la clôture, que
  `breakdown()` ajoute à la ligne `lease`. Aucune migration.

## Contraintes strictes (métier)

- **« Soldé par une intégration globale »** se lit comme `PaymentGatewayService` l'écrit : le
  checkout de `metadata.gateway.settled_by`, et l'intégration qu'il note, dont `agency_id` est nul
  (supprimées comprises).
- **Hypothèse** : seul `settled_by` prouve un règlement en ligne. Un loyer réglé en espèces pendant
  qu'un checkout de la plateforme était ouvert garde ce checkout dans `transaction_id` et dans
  l'historique, et n'est pas reversé. Un règlement antérieur à TCK-593, sans `settled_by`, ne l'est
  pas non plus. L'API n'a jamais servi en production, donc aucune ligne n'est concernée.
- **Hypothèse** : la pénalité est celle du checkout qui a soldé le loyer (`late_fee_included`,
  `late_fee_amount` figés à l'initiation, à défaut `late_fee_amount` de l'échéance). La commission
  la frappe au taux figé de la ligne, comme le loyer : TCK-223 retient la commission « sur chaque
  transaction encaissée ».
- **Hypothèse** : « devises mélangées » veut dire plusieurs devises parmi les lignes retenues. Des
  lignes toutes dans une même devise donnent un reversement dans cette devise, comme avant.
- Le wolof est en pause : le libellé `mixed_currencies` porte en `wo` le texte français tel quel.

## Delta à produire

- [x] `PlatformPayoutService::closeForAgency()` : filtre sur les paiements soldés par une
      intégration globale (une requête `integrations` pour la clôture), pénalité au brut et à la
      commission, refus des devises mélangées.
- [x] `closePeriod()` global : `payout.mixed_currencies` → `excluded` avec le motif
      `mixed_currencies`.
- [x] `breakdown()` : la ligne `lease` reprend la pénalité figée sur le reversement.
- [x] Front : motif `mixed_currencies` dans le type et dans les trois dictionnaires.
- [x] Tests : `PlatformPayoutScopeTest` (neuf) ; fixtures des tests de clôture existants soldées
      par la plateforme (`Tests\Support\EncaissementsPlateforme`).

## Critères d'acceptation

- [x] AC1 — Espèces, intégration d'agence, checkout global ouvert sans `settled_by` : non
      reversés, sans `platform_payout_id`. Une agence sans encaissement plateforme n'a pas de
      reversement.
- [x] AC2 — Loyer 200 000 + pénalité 10 000 soldés ensemble à 5 % : brut 210 000, commission
      10 500, net 199 500, et le détail `lease` dit 210 000 / 10 500.
- [x] AC3 — XOF et EUR mêlés : 422 `payout.mixed_currencies` pour une agence ; agence écartée
      (`mixed_currencies`) dans la clôture globale, les autres agences clôturées.

## Hors périmètre

- L'arrondi au centime de la clôture et l'écart entre clôture et détail : P04.08.
- `agenciesWithUnpaidEligiblePayments()` liste encore une agence qui n'a que des espèces. Elle
  n'obtient aucun reversement et n'est pas listée dans `excluded`, comme une agence sans paiement
  éligible avant ce ticket.

## Notes d'implémentation

- **Ablation** :
  - sans le correctif de `PlatformPayoutService` : 6 rouges sur 7 dans `PlatformPayoutScopeTest`,
    les 15 autres tests de clôture restant verts ;
  - sans l'ajout de la pénalité au détail : `ac2` seul rouge ;
  - avec un repli sur `transaction_id` quand `settled_by` manque : le test « checkout ouvert sans
    règlement » seul rouge ;
  - correctif remis : 7 sur 7 verts.
- **Piège** : `integrations_provider_agency_live_unique` refuse deux intégrations vivantes du même
  fournisseur pour la même agence (`NULLS NOT DISTINCT`), plateforme comprise. La fixture réutilise
  donc l'intégration existante.

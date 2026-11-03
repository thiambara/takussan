---
id: TCK-1415
title: "Rapprochement : un encaissement soldé par la plateforme n'est ni suggéré, ni cherché, ni confirmable sur un crédit de l'agence"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#41-bankstatementline-"
    - "docs/models-spec.md#45-platformpayout-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-141--encaissements-soldés-par-la-plateforme-face-au-relevé-bancaire-de-lagence"
tags: [api, rapprochement, plateforme, pistes]
---

## Contexte

Réf : **P141.01** du fichier de pistes, `validé`.

La clôture de la plateforme (`PlatformPayoutService`) reverse à l'agence, en un seul virement net
de commission, ce qu'une intégration **globale** a encaissé. Un tel loyer ou acompte n'arrive donc
jamais seul sur le compte de l'agence. Le matcher, la recherche manuelle et la confirmation du
rapprochement le traitaient pourtant comme un encaissement de l'agence : suggéré à 70 sur un crédit
du même montant, puis confirmé.

## Décision du porteur

« validé — porteur (2026-10-22) : écarter des candidats d'un crédit et refuser à la confirmation un paiement que `isSettledByPlatform()` lit comme encaissé par la plateforme »

Critère accordé : V1.

## Objectif

Un `BookingPayment` ou `LeasePayment` encaissé par la plateforme ne se rapproche plus d'un crédit du
relevé de l'agence.

## Delta à produire

- [x] Scope `whereNotSettledByPlatform()` sur `HasPaymentAttributes` : la lecture
      d'`isSettledByPlatform()` en SQL (intégration de l'entrée `settled_by`, à défaut du checkout
      courant ; intégration globale, supprimées comprises).
- [x] `ReconciliationMatcher::fetchCandidates()` et `PaymentSearchService` (acomptes, loyers)
      l'appliquent.
- [x] `ReconciliationManager::confirmMatch()` refuse en 422 (`payment_id`) un paiement que
      `isSettledByPlatform()` lit comme encaissé par la plateforme ; message
      `reconciliation.validation.settled_by_platform` (fr, en ; `wo` = texte français, wolof en
      pause).
- [x] Tests : `tests/Feature/Api/Accounting/PlatformSettledReconciliationTest.php`.

## Critères d'acceptation

- [x] AC1 — Loyer soldé par la plateforme, crédit au même montant à J+1 : `suggestFor` nul,
      recherche vide, `POST …/match` → 422, `bank_reconciled_at` reste nul.
- [x] AC2 — Même chose pour un acompte de réservation.
- [x] AC3 — Après la clôture (`platform_payout_id` posé), le loyer reste écarté.
- [x] AC4 — Un loyer soldé par l'intégration propre à l'agence, ou réglé hors ligne, reste suggéré,
      cherché et confirmable.

## Hors périmètre

- Ce qui représente sur le relevé l'argent que la plateforme reverse : P141.02.
- Le scope partagé `whereNotReconciled` et la colonne d'agence d'un acompte : P141.04.

## Notes d'implémentation

- Le scope SQL et `isSettledByPlatform()` sont deux écritures d'une même lecture ; la confirmation
  garde la lecture PHP, celle de la clôture. Les tests assertent les deux sur les mêmes paiements.
- Ablation : correctif retiré (`app/`, `lang/`) → 3 rouges sur 5 (les deux cas « reste
  rapprochable » restent verts) ; garde de confirmation seule neutralisée → 2 rouges
  (« Expected 422 but received 200 ») ; correctif remis → 5 verts.

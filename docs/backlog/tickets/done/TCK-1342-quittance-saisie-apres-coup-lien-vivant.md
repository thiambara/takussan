---
id: TCK-1342
title: "Quittance saisie après coup : la fenêtre du lien court depuis l'enregistrement"
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
    - "docs/models-spec.md#15-leasepayment-"
    - "docs/models-spec.md#84-leasepaymentlink-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-132--liens-portés-par-les-sms-et-whatsapp--hôte-validité-page-ouverte"
tags: [api, paiements, pay-link, sms, pistes]
---

## Contexte

Réf : **P132.01** du fichier de pistes, `validé`.

`markPaid` écrit dans `paid_at` la date effective que l'agence saisit, sans borne, et envoie
aussitôt au locataire sans compte le lien `/pay/{jeton}` de sa quittance. Or
`LeasePaymentLinkService::effectiveExpiry` ferme ce lien à `paid_at` + 30 jours : un loyer saisi
avec une date de plus de 30 jours part par SMS avec un lien qui rend 410 dès l'émission.

## Décision du porteur

« validé — porteur (2026-10-22) : la fenêtre court depuis le plus tardif de `paid_at` et du passage à `paid`, posé par `markPaid` dans une colonne neuve (V4 additif) »

Critère accordé : V7 (et V4 additif, nommé par la décision).

## Objectif

Le lien de quittance envoyé après un paiement enregistré s'ouvre, et reste lisible 30 jours après
l'enregistrement.

## Delta à produire

- [x] Migration neuve : `lease_payments.marked_paid_at`, `timestamp` nullable, avec son `down()`.
- [x] `LeasePayment` : `marked_paid_at` dans `$fillable` et `$casts`.
- [x] `LeasePaymentService::markPaid` pose `marked_paid_at = now()`.
- [x] `LeasePaymentLinkService::effectiveExpiry` : fenêtre de quittance depuis le plus tardif de
      `paid_at` et `marked_paid_at`.
- [x] Test dans `LeasePaymentRecordedToContactTest`.

## Critères d'acceptation

- [x] AC1 — `markPaid` avec `paid_at` = aujourd'hui − 40 jours : le jeton envoyé se résout.
- [x] AC2 — Il se résout encore 29 jours plus tard, et rend 410 31 jours après l'enregistrement.

## Hors périmètre

- Les échéances payées avant cette migration (`marked_paid_at` nul) gardent la fenêtre depuis
  `paid_at` : aucune ligne n'est réécrite.

## Reste à faire

- Borner `paid_at` à `before_or_equal:now` dans `MarkPaidLeasePaymentRequest`, comme
  `MarkLateFeePaidRequest.php:56` : la `Piste` le propose, la décision du porteur ne le reprend pas,
  et le délégué l'a réservé (V1, saisie d'un paiement acceptée aujourd'hui).

## Notes d'implémentation

- Les paiements en ligne posent `paid_at` à l'instant du paiement : seul `markPaid`, dont la date
  est saisie, a besoin de la colonne (décision du porteur).
- Ablation : `LeasePaymentLinkService.php` remis à `HEAD` → 1 rouge (`pay_link.gone` sur le jeton
  envoyé) ; correctif remis → 4/4 verts. `PublicPaymentLinkTest`, `RentReceiptAfterOnlinePaymentTest`,
  `BearerLinkAtRestTest` verts.

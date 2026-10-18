---
id: TCK-873
title: "Un remboursement reçu par webhook écrit `refund_amount` et clôt la tâche de remboursement d'acompte"
status: done
phase: P1
family: bug
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: [TCK-871]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#6-bookingpayment"
    - "docs/models-spec.md#15-leasepayment-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-39--webhooks-de-paiement-refund-et-failed-sur-un-paiement-déjà-soldé"
tags: [back, payments, webhooks, migration, pistes]
---

## Contexte

Réf : **P39.03** du fichier de pistes, `validé` par le porteur (critères accordés : V1, et V4 pour la
colonne de l'échéance). La branche `REFUNDED` de `PaymentGatewayService::applyStatusToPayment`
écrivait le statut seul. `HasPaymentAttributes::paidAmount()` rend `amount − refund_amount` pour une
ligne `refunded` : un acompte remboursé par webhook comptait donc 50 000 encaissés, et sa tâche
`booking_refund` restait ouverte ; `lease_payments` n'avait pas de colonne `refund_amount`, et une
échéance remboursée comptait son montant entier comme reçu.

## Décision du porteur

le webhook de remboursement passe par la même écriture que le geste manuel : `refund_amount` depuis le montant rapporté par le pilote (le montant entier à défaut), plafonné à `amount`, et `closeIfSettled` pour un acompte ; colonne `refund_amount` neuve sur `lease_payments`, avec son `down()` ; tests : l'acompte (statut, `paid_amount`, tâche) et l'échéance

## Objectif utilisateur

L'agence voit un paiement remboursé par le fournisseur compter pour ce qui a réellement été gardé,
et la tâche de remboursement de l'acompte se ferme d'elle-même.

## Contrat de données

- Migration neuve `2026_10_18_070000_add_refund_amount_to_lease_payments` :
  `lease_payments.refund_amount` `decimal(14,2)` nullable, comme sur `booking_payments` ; `down()`
  retire la colonne.
- `LeasePayment` : `refund_amount` fillable, casté `decimal:2`.
- Aucun endpoint ni ressource modifiés.

## Contraintes strictes (métier)

- `refund_amount` = montant rapporté par le pilote, plafonné à `amount` ; le montant entier si le
  pilote n'en rapporte pas.
- Seul le remboursement du règlement qui a soldé le payable l'écrit (TCK-871).
- Un acompte remboursé ainsi appelle `BookingRefundTaskService::closeIfSettled`.

## Delta à produire

- [x] Migration `2026_10_18_070000_add_refund_amount_to_lease_payments`.
- [x] `LeasePayment` : fillable et cast.
- [x] `PaymentGatewayService` : `reportedRefundAmount()`, écriture de `refund_amount`,
  `closeIfSettled` pour un acompte.
- [x] Tests : `tests/Feature/Api/PaymentWebhookRefundTest.php` (acompte, échéance, plafond et
  montant absent).

## Critères d'acceptation

- [x] AC1 — Acompte de 50 000 soldé par webhook Wave, tâche ouverte, remboursement de 50 000 →
  `refunded`, `refund_amount = 50000`, `paid_amount = 0`, tâche `done`.
- [x] AC2 — Échéance de 150 000 soldée, remboursement rapporté de 40 000 → `refunded`,
  `refund_amount = 40000`, `paid_amount = 110000`.
- [x] AC3 — Remboursement rapporté de 400 000 → `refund_amount = 150000` ; sans montant rapporté →
  `refund_amount = 150000`, `paid_amount = 0`.

## Hypothèses

- Un montant rapporté dans une autre devise que celle du payable n'est pas comparable (même règle
  que `assertReportedAmountCoversPayment`, Lemon Squeezy rapportant en USD) : le montant entier est
  pris. Un montant absent, non numérique ou nul aussi.
- Un remboursement partiel passe le payable à `refunded`, comme le geste manuel, avec un
  `refund_amount` partiel : `paid_amount` dit ce qui reste encaissé.

## Hors périmètre

- Ce que les pilotes rapportent réellement pour un remboursement : Wave et Orange Money rendent
  `amount` comme pour un paiement, Lemon Squeezy ne lit pas `refunded_amount` (P39.05 et suivantes).
- L'exposition de `refund_amount` d'une échéance par `LeasePaymentResource` et l'écran de
  l'historique.
- `docs/models-spec.md` § 15 ne décrit pas encore la colonne : à reprendre par `/sync-specs`.

## Notes d'implémentation

- Les tests appliquent le remboursement par `applyEventToMatchingPayment()` sous l'autorité de
  l'intégration (voir TCK-871).
- `closeIfSettled` lit en base les paiements `paid` de la réservation : il est appelé après le
  `save()`.
- Ablation : service remis à l'état de TCK-872 (migration et modèle gardés) → AC1, AC2, AC3 rouges
  (`refund_amount` nul) ; seule la clôture retirée → AC1 rouge (tâche `open`) ; correctif remis → 8
  verts dans la classe.

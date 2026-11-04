---
id: TCK-681
title: "« Enregistrer un paiement reçu » règle l'échéance choisie par mark-paid, et la création refuse paid_at"
status: done
phase: P0
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
  models:
    - docs/models-spec.md#15-leasepayment-
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-13--code-mort-et-doublons
tags: [back, front, leases, payments, pistes]
---

## Contexte

Réf : **P13.01** du fichier de pistes, `validé` par le porteur (critère accordé : V1).

Sur la fiche d'un bail, « Enregistrer un paiement reçu » ouvrait `LeasePaymentDialog`, qui postait
sur `POST /api/leases/{id}/payments` un montant, une période, `paid_at` et une référence.
`StoreLeasePaymentRequest` ne valide ni `paid_at` ni la référence : `validated()` les retirait, et
`LeasePaymentService::create` écrivait une échéance `pending`, sans date. Le loyer reçu devenait
une ligne de plus, en attente, à côté de celle qui restait due. `POST
/api/lease-payments/{id}/mark-paid`, la voie gardée (verrou, checkout ouvert, caution rendue),
n'avait aucun appelant dans le front.

## Décision du porteur

l'écran règle l'échéance choisie par mark-paid ; paid_at refusé à la création

## Objectif

Le gestionnaire qui saisit un loyer reçu règle l'échéance existante, et la création d'échéance ne
laisse plus croire qu'elle a enregistré un paiement.

## Delta à produire

- [x] `StoreLeasePaymentRequest` : `paid_at` est `prohibited` (422 s'il est fourni et non vide).
- [x] Test `LeaseTest::test_create_lease_payment_refuses_paid_at` : 422 sur `paid_at`, aucune
      ligne créée.
- [x] Front : un hook qui poste sur `/api/lease-payments/{id}/mark-paid` (`paid_at`,
      `payment_method`, `transaction_id`) et rafraîchit le bail et son échéancier.
- [x] Front : le dialogue fait choisir l'échéance (en attente ou en retard seulement), puis la date,
      le moyen et la référence ; il ne saisit plus ni montant ni période.
- [x] Tests : `LeasePaymentDialog.test.tsx`, `regler-une-echeance.test.tsx`.

## Critères d'acceptation

- [x] AC1 — `POST /api/leases/{id}/payments` avec `paid_at` rend 422 et n'écrit rien.
- [x] AC2 — Le dialogue ne propose que les échéances `pending` et `late` du bail.
- [x] AC3 — Valider le dialogue appelle `mark-paid` sur l'échéance choisie, la référence en
      `transaction_id`, sans aucune création d'échéance.
- [x] AC4 — Sans échéance à régler, le dialogue le dit et n'offre pas l'envoi.

## Hypothèses (mode sans humain)

- « L'écran » est le dialogue « Enregistrer un paiement reçu » de la fiche du bail : il change de
  geste, il ne gagne pas un second mode. Il ne crée plus d'échéance (charges, régularisation) : la
  création reste à l'API et à « Générer l'échéancier ».
- La référence saisie part en `transaction_id`, le seul champ de `mark-paid` qui la porte.
- `reference_number` reste accepté-puis-ignoré par la création : la décision ne vise que `paid_at`.
- Un checkout en ligne ouvert sur l'échéance rend le refus de l'API dans l'erreur globale du
  dialogue ; le passage outre (`override_open_checkout`) n'y est pas offert.

## Hors périmètre

- Le passage outre à un checkout ouvert depuis ce dialogue (offert par l'échéancier pour la seule
  pénalité).
- Le règlement partiel d'une échéance : `mark-paid` la solde entière.
- `POST /api/payments` (P13.05) et « Générer l'échéancier » (P13.02).

## Notes d'implémentation

- Rouge avant correctif : l'API rendait 201 sur `paid_at` ; le dialogue appelait la création.
- Ablation : la règle `prohibited` retirée, `LeaseTest` rougit (1 sur 9) ; l'ancien dialogue remis,
  ses trois tests rougissent (aucune combobox « Échéance », champ montant présent). Remis : verts.
- Le mock du test expose aussi `useCreateLeasePayment`, que le code ne connaît plus : sans lui,
  l'ablation rougissait sur un export absent du mock, et non sur le comportement.
- Clés `lease.payment.{amount,type,types,periodStart,periodEnd,notes}` retirées des trois langues :
  ce dialogue était leur seul lecteur.

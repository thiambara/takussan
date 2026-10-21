---
id: TCK-1112
title: "Titre d'avis et référence d'encaissement bornés à leur colonne : 422 et non 500 ; commentaire du téléphone du front ramené au code"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: [TCK-1111]
blocks: []
spec_refs:
  features:
    - "docs/features.md#111-avis--réputation"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#11-review"
    - "docs/models-spec.md#15-leasepayment-"
    - "docs/models-spec.md#6-bookingpayment"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-91--bornes-max-des-formrequests-face-aux-varcharn"
tags: [back, front, avis, paiements, validation, pistes]
---

## Contexte

Réf : **P91.08** du fichier de pistes, `retenu · autonome` (A1 et A6 : les colonnes fixent les
bornes, sans changer aucun montant ni l'écriture d'un paiement qui aboutit aujourd'hui ; le
commentaire est ramené à ce que fait le code).

`reviews.title`, `lease_payments.transaction_id` et `booking_payments.transaction_id` sont des
`varchar(255)`. `StoreForAgencyReviewRequest`, `StoreForPropertyReviewRequest`,
`MarkPaidLeasePaymentRequest` et `StoreBookingPaymentRequest` les validaient en `string` sans
`max` : une valeur trop longue atteignait PostgreSQL (22001), soit 500. Le commentaire de
`phoneSchema` (`takussan-web/src/lib/schemas/common.ts`) annonce une normalisation E.164 côté
serveur pour tout téléphone, ce que l'API ne fait pas pour les garants ni les agences (TCK-1106,
TCK-1108 : borne de longueur seulement).

## Objectif utilisateur

Qui saisit un titre d'avis ou une référence de transaction trop longs reçoit une erreur de
validation sur le champ, et non une panne serveur.

## Delta à produire

- [x] `max:255` sur `title` dans les deux requêtes d'avis, et sur `transaction_id` dans les deux
      requêtes d'encaissement.
- [x] Les quatre couples ajoutés à `BornesMaxFaceAuSchemaTest` (TCK-1111).
- [x] Test `tests/Feature/Validation/AvisEtEncaissementFieldLengthTest.php`.
- [x] Commentaire de `phoneSchema` : la normalisation E.164 vaut pour les clients et les visites.

## Critères d'acceptation

- [x] AC1 — `POST /api/agencies/{id}/reviews` et `POST /api/properties/{id}/reviews` avec un
      `title` de 256 caractères : 422 sur `title`, aucun avis ; à 255 : 201.
- [x] AC2 — `POST /api/lease-payments/{id}/mark-paid` avec un `transaction_id` de 256 : 422,
      échéance inchangée ; à 255 : 200.
- [x] AC3 — `POST /api/bookings/{id}/payments` avec un `transaction_id` de 256 : 422, aucun
      paiement ; à 255 : 201.

## Hors périmètre

- Aligner le téléphone des garants et des agences sur `TelephoneSaisi` + `TelephoneJoignable` :
  un choix de format, écarté par TCK-1106 et TCK-1108.

## Notes d'implémentation

- Avant correctif, les quatre voies rendaient 500 `SQLSTATE[22001]` (relevé sous
  `withoutExceptionHandling`) ; l'avis de bien et le paiement de réservation, que le mesureur
  n'avait pas joués, compris.
- Ablation : les quatre FormRequest rendues à `HEAD` → 8 rouges (les 4 tests HTTP et les 4
  couples ajoutés à `BornesMaxFaceAuSchemaTest`), 44 verts ; correctif remis → 52/52.
- `phoneSchema` n'est importé que par `lease.ts` (le garant) : le commentaire le dit, puisque
  c'est justement la voie que l'API ne normalise pas.

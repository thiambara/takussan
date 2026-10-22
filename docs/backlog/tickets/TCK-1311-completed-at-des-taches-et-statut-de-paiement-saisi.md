---
id: TCK-1311
title: "`completed_at` d'une tâche suit `done` ; un paiement de réservation saisi naît `paid`, `pending` ou `partially_paid`"
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
  models:
    - "docs/models-spec.md#32-task-"
    - "docs/models-spec.md#6-bookingpayment"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-147--statuts-posés-par-un-ruleenum-entier-dans-les-requêtes-décriture"
tags: [api, front, tasks, payments, pistes]
---

## Contexte

Réf : **P147.09** du fichier de pistes, `validé` par le porteur. Entrée dans le lot par la famille :
elle cite `StoreBookingPaymentRequest.php` et `BookingPaymentService.php`, que TCK-1309 touche.

Tâche : la création avec `status=done` ne pose pas `completed_at`, et un retour de `done` à `open`
le garde. Paiement de réservation : pour le personnel, `status` accepte tout `PaymentStatus` sauf
`cancelled`, donc une ligne créée `refunded`, `failed` ou `late`, hors du geste `refund`.

## Décision du porteur

porteur (2026-10-22) : poser `completed_at` à la naissance ou au passage `done` d'une tâche, à nul à la réouverture ; le statut d'un paiement créé à la main borné à `paid`, `pending` et `partially_paid`

## Objectif

`completed_at` dit toujours si la tâche est achevée ; une ligne de paiement saisie ne naît plus
remboursée, échouée ou en retard.

## Delta à produire

- [x] `TaskController::store` : `completed_at = now()` si la tâche naît `done`.
- [x] `TaskController::update` : `completed_at` à nul au passage à `open` ou `in_progress`.
- [x] `StoreBookingPaymentRequest` : `status` ∈ `paid`, `pending`, `partially_paid`.
- [x] Front : `CreateBookingPaymentPayload.status` sans `refunded`.
- [x] Tests : `TaskCompletedAtTest`, `BookingPaymentManualStatusTest`.

## Critères d'acceptation

- [x] AC1 — `POST /api/tasks` avec `status=done` → `completed_at` posé ; sans statut → nul.
- [x] AC2 — `PUT /api/tasks/{id}` d'une tâche `done` vers `open` ou `in_progress` → `completed_at` nul.
- [x] AC3 — `POST /api/bookings/{id}/payments` du personnel avec `refunded`, `failed` ou `late` →
      422 sur `status` ; `paid`, `pending`, `partially_paid` → 201.

## Hors périmètre

- `done` → `cancelled` : ce n'est pas une réouverture, `completed_at` est gardé.
- Les lignes `refunded`/`failed`/`late` déjà en base : aucune réécriture de données.

## Notes d'implémentation

- Ablation : les deux écritures de `completed_at` retirées → 2 rouges sur 3 ; la borne de statut
  remise à `except([cancelled])` → 1 rouge sur 2 ; remis → verts. `TaskTest`, `BookingPaymentTest`,
  `BookingPaymentRefundAuthorizationTest`, `BookingRefundTaskTest` verts.

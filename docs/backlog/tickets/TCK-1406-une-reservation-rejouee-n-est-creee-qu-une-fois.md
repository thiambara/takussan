---
id: TCK-1406
title: "Une demande de réservation rejouée sous la même clé n'est créée et notifiée qu'une fois, par le personnel comme par la fiche publique"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1396]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-144--écritures-du-navigateur-quune-réponse-perdue-invite-à-rejouer"
  adr:
    - "docs/adr/0072-une-cle-d-idempotence-commune-pour-les-ecritures-rejouees.md"
tags: [api, web, bookings, idempotence, pistes]
---

## Contexte

Réf : **P144.03** du fichier de pistes, `validé` par le porteur. Deux `POST /api/bookings` identiques, comme deux `POST /api/public/properties/{slug}/booking-request`, créaient deux réservations `pending` et deux notifications ; le tunnel et la fiche publique gardent la saisie après une erreur.

## Décision du porteur

> validé — porteur (2026-10-22) : ADR-0072, lot 2 : la clé sur `POST /api/bookings`, et lot 3 sur l'action serveur `booking-request`, sans règle de rapprochement

## Objectif

La demande renvoyée après une réponse perdue rend la première réservation, sans seconde notification.

## Delta à produire

- [x] `bookings.store` et `public.properties.booking-request` portent `idempotent`, ajoutées à `IdempotentRoutesTest`.
- [x] `useCreateBooking` passe `idempotence: true`.
- [x] `useCleIdempotence` : la clé d'un formulaire qui écrit par une action serveur (ADR-0072 § 7).
- [x] `submitBookingRequest` et `submitPurchaseOffer` reçoivent `cleIdempotence` et l'envoient telle quelle ; `ActionResult` porte `code` sur `idempotency.key_reused`.
- [x] `useBookingRequest` et le formulaire d'offre de `PropertyReservationDialog` engendrent la clé et la renouvellent sur succès.
- [x] Tests : `tests/Feature/Idempotence/ReservationRejoueeTest.php`, `property.idempotence.tck-1406.test.ts`, `useCleIdempotence.tck-1406.test.ts`, `useBookingRequest.idempotence.tck-1406.test.ts`, `bookings.idempotence.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Deux `POST /api/bookings` sous la même clé, à 30 s d'écart : une réservation, le même `id`, aucune notification de plus.
- [x] AC2 — Même chose pour la demande publique.
- [x] AC3 — L'action envoie la clé reçue telle quelle d'un essai à l'autre, aucune sans clé.
- [x] AC4 — Le formulaire garde la clé après un échec, en prend une neuve après un succès ou `idempotency.key_reused`.

## Hors périmètre

- Aucun rapprochement par client, bien et dates (décision du porteur).
- `contact-message` et `contact-lead` : TCK-1408 et TCK-1410.

## Notes d'implémentation

- Ablation API : routes sans `idempotent` → `ReservationRejoueeTest` 2 rouges (2 réservations), `IdempotentRoutesTest` 2 rouges ; front : en-tête jamais posé par l'action → 2 rouges, clé non passée par `useBookingRequest` → 1 rouge, option retirée de `useCreateBooking` → 1 rouge ; remis → verts.

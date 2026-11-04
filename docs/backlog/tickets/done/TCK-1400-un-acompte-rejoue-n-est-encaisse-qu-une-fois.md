---
id: TCK-1400
title: "Un acompte rejoué sous la même clé n'est encaissé qu'une fois"
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
tags: [api, web, bookings, payments, idempotence, pistes]
---

## Contexte

Réf : **P144.04** du fichier de pistes, `validé` par le porteur. Deux `POST /api/bookings/{id}/payments` identiques créaient deux lignes `paid` sous deux reçus ; `BookingPaymentDialog` garde sa saisie après une erreur.

## Décision du porteur

> validé — porteur (2026-10-22) : ADR-0072, lot 2 : la clé sur la route d'acompte

## Objectif

L'acompte renvoyé après une réponse perdue rend le premier encaissement au lieu d'en écrire un second.

## Delta à produire

- [x] `bookings.payments.store` porte `idempotent`, ajoutée à `IdempotentRoutesTest`.
- [x] `useCreateBookingPayment` passe `idempotence: true`.
- [x] Tests : `tests/Feature/Idempotence/AcompteRejoueTest.php`, `src/lib/queries/__tests__/bookings.idempotence.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Deux envois du même acompte sous la même clé, à 30 s d'écart : une ligne `paid`, le même reçu rendu.
- [x] AC2 — Le hook demande l'option.

## Hors périmètre

- Les totaux, reversements et tableaux de bord : ils ne lisent plus de doublon, rien n'y change.
- Le dialogue ne renouvelle pas la clé à sa fermeture : une saisie changée après une réponse perdue reçoit 422 `idempotency.key_reused`, puis part sous une clé neuve (ADR-0072 § 7).

## Notes d'implémentation

- Ablation : route sans `idempotent` → `AcompteRejoueTest` rouge (deux reçus distincts) et `IdempotentRoutesTest` rouge ; option retirée du hook → 1 rouge vitest ; remis → verts.

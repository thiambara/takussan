---
id: TCK-XXX
title: <titre court de la tâche>
status: todo          # todo | doing | review | done | blocked
phase: P2             # P0 | P1 | P2 | P3 | EF
family: applicatif    # applicatif | evolution | technique | bug
estimate: M           # S (≤2j) | M (3-5j) | L (6-10j) | XL (>10j)
created: YYYY-MM-DD
updated: YYYY-MM-DD
depends_on: []        # [TCK-003, TCK-005]
blocks: []            # tickets qui attendent celui-ci
spec_refs:
  features: []        # ["docs/features.md#11-gestion-des-biens"]
  models: []          # ["docs/models-spec.md#3-property"]
tags: []              # [booking, search, back, front]
---

## Contexte

Pourquoi ce ticket existe. Lien vers le warning, la décision produit, ou le sync-pass
d'origine. **Ne recopie JAMAIS la spec** — référence-la via `spec_refs`.

## Objectif

Une phrase: ce que ce ticket livre.

## Delta à produire

Liste concrète des changements à effectuer — c'est le **seul** endroit où on décrit
le travail. Exemples:

- [ ] Migration: `add_refund_amount_to_booking_payments`
- [ ] Endpoint: `POST /api/bookings/{booking}/cancel`
- [ ] Service: `App\Services\Booking\BookingCancellationService`
- [ ] Composant React: `CancelBookingDialogComponent`
- [ ] Tests: `BookingCancellationTest` (3 scénarios)

## Critères d'acceptation

- [ ] AC1 — formulation testable
- [ ] AC2 — formulation testable
- [ ] AC3 — formulation testable

## Hors périmètre

- Ce qui n'est *pas* traité par ce ticket (évite le scope creep).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_

---
id: TCK-1930
title: "La liste des réservations ne garde plus à l'agent créateur suspendu ou retiré les réservations de ses biens"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: [TCK-1928]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#22-rôles--permissions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-190--créateur-dun-bien-dagence-suspendu-ou-retiré-face-aux-règles-qui-lacceptent-par-la-seule-identité"
tags: [api, bookings, authorization, personal-data, pistes]
---

## Contexte

Réf : **P190.02** du fichier de pistes, `validé` (V2 et V3 accordés). TCK-1707 fait juger
`BookingPolicy::view` par `BailleurDuBien`, mais `BookingController::index` listait toujours
`orWhereHas('property', … user_id)` et chargeait `customer` : l'agent qui a saisi le bien, suspendu
ou retiré, voyait les réservations de ce bien et le téléphone du client.

## Décision du porteur

validation du porteur (2026-10-23) : la piste telle qu'écrite ; la première du lot (téléphone du client)

## Delta à produire

- [x] `BookingController::index` : clause « mes biens » par `BailleurDuBien::restreindre` (TCK-1928).
- [x] Test `AgentCreateurListeDesReservationsTest`.

## Critères d'acceptation

- [x] AC1 — Agent créateur suspendu, puis retiré : la réservation du bien est absente de `GET /api/bookings`.
- [x] AC2 — Bailleur du bien bloqué : présente.
- [x] AC3 — Agent créateur actif : présente (périmètre du personnel).

## Hors périmètre

- La clause `created_by_id` (l'auteur de la réservation), que la piste ne vise pas.

## Notes d'implémentation

- Ablation : contrôleur remis → 2 rouges sur 4 ; remis → 4 verts.

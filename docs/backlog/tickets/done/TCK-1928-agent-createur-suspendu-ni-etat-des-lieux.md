---
id: TCK-1928
title: "L'agent créateur d'un bien, suspendu ou retiré, ne lit, ne modifie ni ne liste plus l'état des lieux de ce bien"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: [TCK-1926]
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#22-rôles--permissions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-190--créateur-dun-bien-dagence-suspendu-ou-retiré-face-aux-règles-qui-lacceptent-par-la-seule-identité"
tags: [api, inventories, authorization, pistes]
---

## Contexte

Réf : **P190.01** du fichier de pistes, `validé` (V2 accordé). `InventoryPolicy::view` acceptait
`property.user_id === user.id`, et `update` passait `property.user_id` à `landlordWrites`, qui ne
refuse que le bailleur bloqué : l'agent qui a saisi le bien, suspendu ou retiré, lisait, modifiait
et listait l'état des lieux (`InventoryController::index`, `orWhereHas('property', … user_id)`).

## Décision du porteur

validation du porteur (2026-10-23) : la piste telle qu'écrite (`BailleurDuBien::est` en lecture, `bailleurEcrit` en écriture, même borne pour la liste)

## Delta à produire

- [x] `BailleurDuBien::restreindre()` : la règle pour une requête de liste (désigné, ET sans agence ou profil propriétaire dans l'agence) ; `LeaseController::index` (TCK-1926) la lit aussi.
- [x] `InventoryPolicy::view` par `BailleurDuBien::est`, `update` par `bailleurEcrit`.
- [x] `InventoryController::index` : clause du bien par `BailleurDuBien::restreindre`.
- [x] Test `AgentCreateurEtatDesLieuxTest`.

## Critères d'acceptation

- [x] AC1 — Agent créateur suspendu, puis retiré : `GET` et `PATCH /api/inventories/{id}` en 403, rien d'écrit, absent de `GET /api/inventories`.
- [x] AC2 — Bailleur du bien bloqué : lecture 200 et présent dans la liste, `PATCH` 403.
- [x] AC3 — Bailleur actif : lecture, modification et liste.

## Hors périmètre

- La branche `conducted_by` (celui qui a conduit l'état des lieux), que la piste ne vise pas.

## Notes d'implémentation

- Ablation : politique et contrôleur remis → 2 rouges sur 4 (200 au lieu de 403) ; remis → 4 verts.

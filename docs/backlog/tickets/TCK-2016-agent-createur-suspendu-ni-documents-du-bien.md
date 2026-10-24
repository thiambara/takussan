---
id: TCK-2016
title: "L'agent créateur d'un bien, suspendu ou retiré, ne lit plus les documents du bien ni du bail et n'en joint plus"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#22-rôles--permissions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-190--créateur-dun-bien-dagence-suspendu-ou-retiré-face-aux-règles-qui-lacceptent-par-la-seule-identité"
tags: [api, documents, authorization, pistes]
---

## Contexte

Réf : **P190.05** du fichier de pistes, `validé` (V2 accordé). `DocumentPolicy::reaches` jugeait
la branche du bailleur par l'identité en lecture (`properties.user_id`, `leases.landlord_id`) et par
`landlordWrites` en écriture, qui ne refuse que le bailleur bloqué. L'agent qui a saisi un bien
d'agence (`PropertyController::store` le pose en `user_id`, `LeaseService::create` le recopie en
`landlord_id`), suspendu ou retiré, lisait donc les documents du bien et du bail
(`GET /api/documents/{id}` 200) et en joignait (`POST /api/documents` 201).

## Décision du porteur

validation du porteur (2026-10-23) : la piste telle qu'écrite (`BailleurDuBien` pour les colonnes de bailleur, `landlordWrites` gardé pour les colonnes d'auteur)

## Delta à produire

- [x] `DocumentPolicy::reaches` : la branche du bailleur (bien, bail, bien de la réservation, bien de l'état des lieux) par `BailleurDuBien::est` en lecture et `bailleurEcrit` en écriture.
- [x] Les colonnes d'auteur (`bookings.created_by_id`, `inventories.conducted_by`, `customers.added_by_id`) restent jugées comme avant.
- [x] Test `AgentCreateurDocumentsDuBienTest`.

## Critères d'acceptation

- [x] AC1 — Agent créateur suspendu, puis retiré : `GET /api/documents/{id}` d'un document du bien et du bail en 403 ; `POST /api/documents` sur le bien en 404 `document.owner_not_found` (TCK-732), rien d'écrit.
- [x] AC2 — Bailleur du bien bloqué : lecture 200, rattachement refusé (404).
- [x] AC3 — Bailleur actif, et particulier d'un bien sans agence : lecture 200, rattachement 201.

## Hypothèse

- L'agent créateur **actif** garde ses documents par la branche du personnel (`isStaffOf`), comme
  le pose `BailleurDuBien` (TCK-1718) : non testé ici, inchangé.

## Hors périmètre

- La liste `GET /api/documents` (la piste ne vise que la lecture unitaire et le rattachement).

## Notes d'implémentation

- Ablation : `DocumentPolicy` remise à `pre-dev` → 2 rouges sur 5 (200 au lieu de 403) ; remise → 5 verts.

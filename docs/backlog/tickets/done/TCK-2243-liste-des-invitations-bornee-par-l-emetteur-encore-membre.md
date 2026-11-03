---
id: TCK-2243
title: "La liste des invitations ne rend plus à l'émetteur suspendu ou retiré les invitations qu'il a émises"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#48-invitation-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-233--colonnes-dauteur-du-personnel-restées-hors-de-la-règle-dauteur-dadr-0031"
tags: [api, invitations, autorisation, pistes]
---

## Objectif

`GET /api/invitations`, pour qui ne passe pas `viewAny`, ne rend plus les invitations émises par
l'appelant que si elles sont sans agence ou d'une agence dont il est encore membre.

## Contexte

Réf : **P233.02** du fichier de pistes, `retenu · autonome` (A1).

- `InvitationController::visibleScope` rendait `where('invited_by', $user->id)` seul. Depuis
  TCK-2194, `InvitationPolicy::view` borne la branche émetteur par `isMemberAt` : l'agent suspendu
  ou retiré recevait 403 sur l'invitation, mais la retrouvait dans la liste, adresse de l'invité
  comprise. TCK-2194 avait laissé la liste hors périmètre, faute d'être citée par la décision.
- ADR-0031, amendement du 2026-10-24, partie B : la forme SQL de la règle d'auteur borne les
  listes, et `invited_by` en est une colonne.

## Hypothèses (mode sans humain)

- La forme SQL d'`isMemberAt` est `MembershipCapabilityResolver::memberAgencyIds`, comme
  `BookingController::index` depuis TCK-2196.
- La branche `viewAny` (`team.invite`, portée `staffAgencyId`) reste telle quelle.

## Delta à produire

- [x] `InvitationController::visibleScope` : branche émetteur bornée par l'appartenance.
- [x] `ListeParLEmetteurEncoreMembreTest`.

## Critères d'acceptation

- [x] AC1 — Agent émetteur suspendu, puis retiré : l'invitation est absente de
  `GET /api/invitations`, et `view` refuse (prémisse vérifiée).
- [x] AC2 — Témoins : l'agent émetteur actif et l'émetteur d'une invitation sans agence la listent.

## Hors périmètre

- La branche `viewAny` et la délégation planifiée (reste de TCK-2194, P218.01).

## Notes d'implémentation

- Avant correctif : 2 rouges sur 4 (invitation listée à l'émetteur suspendu et à l'émetteur retiré).
- Ablation (branche rendue à `invited_by` seul) → 2 rouges sur 4 ; remise → 4 verts.

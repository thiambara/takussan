---
id: TCK-2194
title: "L'émetteur d'une invitation ne la lit plus une fois suspendu ou retiré de l'agence"
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-218--ce-que-le-retrait-éteint-et-que-la-suspension-laisse--délégations-de-rôle-et-colonnes-dauteur"
tags: [api, invitations, autorisation, pistes]
---

## Objectif

`InvitationPolicy::view` ne rend l'invitation à son émetteur que si elle est sans agence ou s'il
est encore membre de son agence.

## Contexte

Réf : **P218.05** du fichier de pistes, `validé`.

### Décision du porteur

> validé — validation du porteur (2026-10-24) : `InvitationPolicy::view` : émetteur et (agence nulle ou `isMemberAt`) ; le volet de la délégation planifiée se ferme avec P218.01

- La branche « émetteur » de `view` ne jugeait pas l'appartenance : l'agent suspendu ou retiré
  lisait l'invitation qu'il avait émise, adresse de l'invité comprise. `revoke` et `resend` le
  jugent depuis TCK-429.

## Reste à faire

- La délégation `scheduled` vers un délégué suspendu, que la décision ferme avec P218.01.

## Hypothèses (mode sans humain)

- « Membre » se lit par `MembershipCapabilityResolver::isMemberAt`, comme
  `CustomerPolicy::isAuthorStillMember` (précédent que cite ADR-0031, amendement du 2026-10-24).
- La portée de la liste (`InvitationController::visibleScope`) n'est pas dans la décision : elle
  reste telle quelle.

## Delta à produire

- [x] `InvitationPolicy::view` : branche émetteur bornée par l'appartenance.
- [x] `LectureParLEmetteurEncoreMembreTest`.

## Critères d'acceptation

- [x] AC1 — Agent émetteur suspendu, puis retiré : `GET /api/invitations/{id}` → 403.
- [x] AC2 — Témoins : agent émetteur actif → 200 ; émetteur d'une invitation sans agence → 200.

## Hors périmètre

- La liste des invitations émises (`visibleScope`), non citée par la décision.
- La délégation planifiée (reste, P218.01).

## Notes d'implémentation

- Avant correctif : 200 pour l'agent suspendu et pour l'agent retiré.
- Ablation (branche émetteur rendue à `invited_by` seul) → 2 rouges sur 4 ; remise → 4 verts.

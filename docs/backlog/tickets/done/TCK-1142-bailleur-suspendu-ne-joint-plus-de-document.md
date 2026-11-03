---
id: TCK-1142
title: "Un bailleur suspendu ne joint plus de document à son bail, son bien, sa réservation ni son état des lieux"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#22-document-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-82--bailleur-et-membre-jugés-en-dur-hors-de-landlordwrites-et-des-capacités"
tags: [back, documents, authorization, adr-0031, pistes]
---

## Contexte

Réf : **P82.02** du fichier de pistes, `validé` (V2 accordé : le découpage de l'autorisation entre
rattachement et lecture).

`DocumentPolicy::attachTo()` jugeait le bailleur par `landlord_id === user.id` (bail) et
`property.user_id === user.id` (bien, réservation, état des lieux), sans `landlordWrites` :
un bailleur suspendu (`blocked`) dans l'agence joignait encore des documents (`POST /api/documents`
→ 201), alors que la même policy lui refuse `update`, `share` et `delete` (ADR-0031 § 2).

## Décision du porteur

validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

Choix retenu : la piste demande de remplacer les comparaisons d'identité de `attachTo()` par
`landlordWrites`. Écrit tel quel, ce remplacement retirerait aussi la **lecture** au bailleur
suspendu, puisque `view()` appelait `attachTo()` (relevé par la mesure du 2026-10-20), ce que
contredit ADR-0031 § 2. Retenu : l'accès au porteur passe dans une méthode privée `reaches()` à
deux modes ; `attachTo()` l'appelle en écriture (branches du bailleur par `landlordWrites`),
`view()` en lecture (inchangée). Le refus de `store` reste un 404 (`document.owner_not_found`,
TCK-732), pas un 403. La branche `conducted_by` de l'état des lieux n'est pas touchée : la piste
ne la cite pas.

## Objectif utilisateur

Un bailleur suspendu par une agence garde la lecture des documents de ses biens et baux de cette
agence, mais n'y rattache plus de pièce.

## Delta à produire

- [x] `DocumentPolicy` : `reaches($user, $documentable, writing)`, appelée par `view()` (lecture) et
      `attachTo()` (écriture).
- [x] Test dans `tests/Feature/Api/Agency/TeamMemberSuspensionTest.php`.

## Critères d'acceptation

- [x] AC1 — bailleur bloqué dans A : `POST /api/documents` vers son bail, son bien, une réservation
      et un état des lieux de son bien de A → 404, aucun document créé.
- [x] AC2 — il lit toujours un document de son bail de A (`GET /api/documents/{id}` → 200), et joint
      encore à son bien de B, où il est actif (201).
- [x] AC3 — le locataire du bail et l'admin de A y joignent toujours (201).

## Hors périmètre

- La branche `conducted_by` de l'état des lieux, et celle du créateur d'une réservation.

## Notes d'implémentation

- Ablation : `DocumentPolicy` rendu à son état d'avant → AC1 rouge (201 sur le bail) ; remis → vert.

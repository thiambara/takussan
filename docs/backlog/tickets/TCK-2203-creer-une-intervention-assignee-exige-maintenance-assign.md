---
id: TCK-2203
title: "Créer une intervention déjà assignée exige `maintenance.assign`, comme la modification"
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
    - "docs/features.md#18-maintenance--interventions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-227--requêtes-de-création-plus-larges-que-les-gestes-et-les-modifications-resserrés"
tags: [back, maintenance, autorisation, pistes]
---

## Objectif utilisateur

Un rôle personnalisé qui retire `maintenance.assign` retire l'assignation partout : un membre de
l'équipe ne contourne plus le refus du `PATCH` en assignant dès la création.

## Contexte

Réf : **P227.02** du fichier de pistes, `retenu · autonome` (A1 : la règle « la branche équipe
exige `maintenance.assign` » est écrite par TCK-592 dans `MaintenanceRequestPolicy::actAsPrincipal`).

Avant (mesuré) : agent d'agence dont le rôle porte `maintenance.close` sans `maintenance.assign`,
`POST /api/maintenance-requests` avec `assigned_to` = un prestataire de l'agence → 201, assigné ;
le `PATCH {assigned_to}` du même compte → 403. `MaintenanceRequestController::store` retenait
`assigned_to` sur le seul `isPrincipalFor`.

## Hypothèses (mode sans humain)

- Le refus est un **403**, comme au `PATCH` (TCK-445 : porter un champ du donneur d'ordre sans le
  droit est un 403, pas un champ ignoré).
- Le locataire qui envoie `assigned_to` reste traité comme aujourd'hui (champ ignoré) : il n'est pas
  donneur d'ordre, et le correctif ne juge que le personnel.
- Le bailleur du bien et le super-admin ne sont pas jugés par la capacité, comme dans
  `actAsPrincipal`.

## Delta à produire

- [x] `MaintenanceRequestPolicy::teamMayAssignOn(User, Property)` : la branche équipe de
  `actAsPrincipal`, jugée sur le bien, lue par `actAsPrincipal` et par la création.
- [x] `MaintenanceRequestController::store` : 403 quand `assigned_to` est porté par un donneur
  d'ordre de l'équipe sans `maintenance.assign`.
- [x] Tests : `MaintenanceCapabilitiesTest::test_agent_without_assign_cannot_assign_at_creation`
  (témoin « avec » compris), `…::test_agent_without_assign_still_creates_unassigned`.

## Critères d'acceptation

- [x] AC1 — Agent sans `maintenance.assign`, `POST /api/maintenance-requests` avec `assigned_to` →
  403, aucune intervention assignée créée.
- [x] AC2 — Agent avec `maintenance.assign`, même corps → 201, `assigned_to` posé.
- [x] AC3 — Agent sans `maintenance.assign`, sans `assigned_to` → 201, non assignée.

## Hors périmètre

- `priority` à la création, champ du donneur d'ordre au `PATCH`, reste ouvert au locataire à la
  création : c'est un autre geste, que la piste ne vise pas.

## Notes d'implémentation

- **Ablation** : la ligne `abort_if(… teamMayAssignOn …)` retirée → 1 rouge sur 7
  (`MaintenanceCapabilitiesTest`, 201 au lieu de 403) ; remise → 7 verts.

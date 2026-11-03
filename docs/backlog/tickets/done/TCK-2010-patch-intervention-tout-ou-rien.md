---
id: TCK-2010
title: "Le PATCH d'une intervention s'écrit en entier ou pas du tout, et can_assign est faux sur completed"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#21-maintenancerequest-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-184--champs-hors-statut-que-le-patch-générique-écrit-alors-quun-geste-dédié-les-garde"
tags: [back, maintenance, pistes]
---

## Contexte

Réf : **P184.02** du fichier de pistes, `validé` (critère accordé : V1). `MaintenanceRequestController::update`
écrivait le coût réel et l'accord du bailleur (`recordOwnerCost`), puis l'heure et la priorité
(`fill()->save()`), avant `assign()`, hors de toute transaction. Sur une demande `completed`,
`assign()` refuse toute réassignation (`maintenance.reassign_after_completion`) : la réponse
était 422, et la ligne gardait tout le reste. Le front y menait, `can_assign` valant vrai hors
statut terminal, donc sur `completed`.

## Décision du porteur

> validé — validation du porteur (2026-10-23) : une transaction autour de toute la mise à jour ; `can_assign` faux sur `completed`

## Objectif utilisateur

Une erreur à l'enregistrement de l'intervention ne laisse plus une modification à moitié faite, et
le bloc d'assignation n'est plus offert là où l'API le refuse.

## Contrat de données

- `PATCH /api/maintenance-requests/{id}` : sur un refus d'`assign()`, rien n'est écrit (coût réel,
  `metadata.owner_agreed_actual_cost`, heure, priorité, assigné). Le code de réponse est inchangé.
- `abilities.can_assign` vaut `false` sur une intervention `completed`.

## Delta à produire

- [x] `MaintenanceRequestController::update` : `DB::transaction` autour du coût réel, de `fill()->save()` et d'`assign()`.
- [x] `MaintenanceRequestResource::abilitiesBlock` : `can_assign` faux sur `completed`.
- [x] Test `MaintenanceUpdateAtomiciteTest`.

## Critères d'acceptation

- [x] AC1 — Demande `completed`, priorité `low`, sans heure ; `{assigned_to: autre, scheduled_at: J+3, priority: urgent}` → 422 `maintenance.reassign_after_completion`, ligne inchangée.
- [x] AC2 — `{assigned_to: autre, actual_cost: 1000}` → 422, ni `actual_cost` ni `owner_agreed_actual_cost` écrits.
- [x] AC3 — Témoin : `{priority: urgent}` seul sur `completed` → 200, écrit.
- [x] AC4 — `can_assign` faux sur `completed`, vrai sur `in_progress` pour le bailleur.

## Hors périmètre

- Le changement d'heure sans changement d'assigné reste permis sur `completed` : l'API ne le
  refusait pas, et la décision ne le demande pas. L'écran ne l'offre plus, puisque le bloc d'assignation est masqué.

## Notes d'implémentation

- Ablation : sans la transaction (la closure appelée telle quelle), AC1 et AC2 rouges ; sans la
  condition `completed` de `can_assign`, AC4 rouge ; remis → 5 verts.
- `MaintenanceStatusChanged` est `ShouldDispatchAfterCommit` : l'événement d'`assign()` part après
  le commit, jamais pour une mise à jour annulée.

---
id: TCK-2595
title: "Tâches : le nom du bien au lieu de « Un bien », les tâches de l'équipe pour l'admin, et le filtre « en retard ou aujourd'hui »"
status: todo
phase: P1
family: back
estimate: S
wave: 89
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2596]
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#32-task-"
tags: [back, tasks, crm, audit-ux, app]
---

## Objectif utilisateur

La tâche « Faire signer l'état des lieux d'entrée » dit de quel logement il s'agit ; l'admin voit ce qui traîne dans son équipe ; la journée de l'agent lit en une requête ce qui est en retard ou dû aujourd'hui.

## Contrat de données

**Re-mesuré sur `1bce3798a`** — la cause de « Un bien » (audit § 6, P1) n'est pas le front :
- `TaskController::taskable` (`:212-235`) ne rend le `label` d'un parent que si `TaskPolicy::attachTo` passe ; pour un bien, `attachTo` exige `PropertyPolicy::update` (`TaskPolicy.php:124`), donc `properties.update_any` pour le personnel (`PropertyPolicy.php:156-163`) ; un agent sans cette capacité reçoit `label: null`, et le front affiche « Un bien » (`MyTasks.tsx:138`, `fr.json` `hidden.property`) ;
- l'index ne rend que les tâches assignées à l'utilisateur, créées par lui ou couvertes pendant une absence (`TaskController.php:33-44`) : **aucune vue d'équipe** ;
- `filter[due]` accepte une seule valeur (`overdue|today|upcoming|none`, `Task.php:122-135`).

À changer :
- Le `label` (et la vignette) d'un bien parent se lit sous `PropertyPolicy::view` — la règle de **lecture** du bien —, distincte de `attachTo` (qui reste la règle pour **rattacher** une tâche). Même règle pour le client : `CustomerPolicy::view` (inchangé dans les faits).
- `filter[due]` accepte une liste (`overdue,today`).
- `filter[team]=1` : pour un détenteur de `crm.view_all`, les tâches assignées au personnel actif de l'agence active (avec `filter[assigned_to_id]` pour isoler un agent) ; `include=assignedTo` (`{id, name}`).
- Ressource : `taskable.subtitle` (quartier du bien, ou téléphone formaté du client) pour la ligne.

## Contraintes strictes (métier)

- **Aucune lecture élargie** : un agent ne lit le nom d'un bien que s'il peut ouvrir ce bien ; un test l'affirme dans les deux sens (bien de l'agence lisible → nom ; bien d'un bailleur privé non lisible → `null`).
- `filter[team]=1` sans `crm.view_all` : 403 ; il ne sort jamais de l'agence active.
- Les règles d'écriture ne changent pas : assignation au personnel de l'agence seulement (422 `task.assignee_not_staff`), suppléant pendant une absence, suppression par le créateur seul.

## Delta à produire

- [ ] `TaskController::taskable` sous `view` ; `subtitle`.
- [ ] `filter[due]` en liste ; `filter[team]` ; `include=assignedTo`.
- [ ] Tests : `TaskParentLabelTest` (agent sans `properties.update_any` lit le titre d'un bien de l'agence ; bien non lisible → `null`), `TaskDueListFilterTest`, `TaskTeamFilterTest` (admin → tâches de deux agents ; agent → 403 ; autre agence jamais).

## Critères d'acceptation

- [ ] AC1 (rouge sur `1bce3798a`) — Un agent sans `properties.update_any`, tâche rattachée au F2 de Grand Yoff de son agence : `taskable.label = "F2 · Grand Yoff"` (titre du bien).
- [ ] AC2 — `filter[due]=overdue,today` rend les tâches ouvertes en retard et celles du jour, pas celles de demain.
- [ ] AC3 — L'admin d'agence avec `filter[team]=1` reçoit les tâches de ses agents ; un agent reçoit 403.
- [ ] Ablation consignée (AC1).

## Hors périmètre

- L'écran (TCK-2596).
- La tâche dont le parent est supprimé (TCK-617, point 5, décision en attente).
- Les tâches qui naissent seules des événements (ambition de l'audit, non retenue : la relance proposée est portée par TCK-2581 et TCK-2596).

## Notes d'implémentation

_(à remplir par implementing-specs)_

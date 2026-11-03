---
id: TCK-1361
title: "Les tâches, visites et interventions du tableau de bord de l'agent sont bornées à l'agence active"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-127--indicateurs-des-tableaux-de-bord-de-lagent-du-bailleur-et-de-dashboardme"
tags: [api, dashboard, agent, isolation, pistes]
---

## Contexte

Réf : **P127.05** du fichier de pistes, `validé` (V7 accordé).

Le tableau de bord de l'agent bornait ses biens, clients et baux à l'agence active, mais pas ses
tâches (`assigned_to_id`), visites (`agent_id`) ni interventions (`assigned_to`). Un agent de
l'agence A voyait une tâche sur un client de l'agence B à côté des chiffres de A.

## Décision du porteur

porteur (2026-10-22) : tâches, visites et interventions bornées à l'agence active par leur parent (bien ou client), comme les clients et les baux du même tableau

## Objectif

Sous une agence active, les tâches, visites et interventions du tableau de l'agent sont celles dont
le parent appartient à cette agence.

## Delta à produire

- [x] `DashboardAgentService` : `tasks` (ouvertes, en retard, du jour, liste), `recent_activity`,
      `visits` (7 jours, du jour) et `maintenance.open` bornés par leur parent quand `agency_id` est
      connu ; docblock mis à jour.
- [x] `DashboardAgentAgencyBoundTest` : le même jeu dans deux agences, seul celui de l'agence active
      compte.

## Critères d'acceptation

- [x] AC1 — Agent de A, un jeu identique dans A et dans B : `tasks.open = 2`, `tasks.overdue = 1`,
      `visits.upcoming_7d = 2`, `visits.today = 1`, `maintenance.open = 1`, et la liste comme
      l'activité récente ne portent que les tâches de A.

## Hypothèses

- **Une tâche de remboursement a pour parent une réservation** (`BookingRefundTaskService`), qui
  porte `agency_id` : elle est bornée par l'agence de la réservation. La décision nomme « bien ou
  client », les deux parents qu'accepte `StoreTaskRequest` ; écarter les tâches de remboursement
  (priorité haute) du tableau de l'agent irait contre son intention, qui est la seule frontière
  d'agence.
- **Une tâche sans parent n'est d'aucune agence** et ne compte plus sous une agence active, comme
  dans `TeamPerformanceService`. L'API n'en crée pas (`taskable_*` requis), et c'est la lecture
  littérale de « bornées par leur parent ».
- Sans agence active (`agency_id` nul), rien ne change.
- Un parent supprimé en douceur garde son agence (`SoftDeletingScope` levé sur le parent) : seule la
  frontière d'agence change.

## Hors périmètre

- `TeamPerformanceService` ne lit pas les tâches de remboursement (parents client et bien seuls).

## Notes d'implémentation

- Ablation : `DashboardAgentService` remis à l'état d'avant → `tasks.open = 4` au lieu de 2, rouge ;
  remis → vert.

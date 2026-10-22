---
id: TCK-1260
title: "Aperçu de l'agent : les tâches se départagent par le rang de leur priorité, pas par la chaîne"
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
    - "docs/features.md#16-crm--relation-client"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-134--tris-sur-une-colonne-denum-rangée-en-chaîne"
tags: [api, dashboard, taches, tri, pistes]
---

## Contexte

Réf : **P134.01** du fichier de pistes, `retenu · autonome` (A1).

`DashboardAgentService` range les cinq tâches de l'aperçu par échéance, puis par
`orderByDesc('priority')` sur une colonne texte : `medium`, `low`, puis `high`. Une tâche haute
priorité sans échéance sort la première de l'aperçu (`limit(5)`).

## Objectif

À échéance égale, la tâche la plus prioritaire sort la première.

## Delta à produire

- [x] `App\Sorts\TaskPrioritySort` : `CASE priority WHEN … END`, rangs pris de
      `TaskPriority::cases()`, comme TCK-1126 pour les annonces ; utilisable aussi comme tri
      spatie (`Sort`).
- [x] `DashboardAgentService` : le départage passe par elle.
- [x] Test dans `DashboardAgentTest`.

## Critères d'acceptation

- [x] AC1 — Trois tâches sans échéance `low`, `medium`, `high` → `high`, `medium`, `low`.

## Hors périmètre

- Brancher la classe sur `sort=priority` des listes de tâches (P134.03, entrée à part).

## Notes d'implémentation

- Ablation : retour à `orderByDesc('priority')` → 1 rouge ; correctif remis → 6/6 verts.
  `DashboardAgentScopeTest` vert.

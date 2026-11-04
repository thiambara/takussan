---
id: TCK-1910
title: "« En retard » d'une tâche : une seule définition, échue avant aujourd'hui, pour la liste, le tableau de bord et la performance d'équipe"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-198--un-même-mot-compté-par-des-règles-différentes-dun-écran-à-lautre"
tags: [api, crm, dashboard, reporting, pistes]
---

## Objectif utilisateur

L'agent qui lit « 2 en retard » sur son tableau de bord retrouve ces deux tâches sous le filtre
« En retard » de sa liste, et une tâche due ce matin n'est pas comptée à la fois « en retard » et
« du jour ».

## Contexte

Réf : **P198.01** du fichier de pistes, `retenu · autonome` (A1). TCK-591 (AC7) fixe « en retard » :
tâche ouverte échue avant le jour, dans le fuseau de l'agence ; c'est la règle du filtre
`filter[due]=overdue` (`Task::customQueryFilters`). `DashboardAgentService` (`tasks.overdue`, repris
par `/dashboard/me`) et `TeamPerformanceService` (`tasks_overdue`) jugeaient `due_at < now()`.

## Hypothèses (mode sans humain)

- La règle de la liste fait foi (TCK-591 AC7), y compris son fuseau `Task::DUE_TIMEZONE`.
- Le front n'affiche que le nombre rendu par l'API : aucun changement côté `takussan-web/`.

## Delta à produire

- [x] Portée `Task::scopeOverdue()` : ouverte (`OPEN_STATUSES`), `due_at` avant le début du jour `Africa/Dakar`.
- [x] Le filtre `filter[due]=overdue`, `DashboardAgentService` et `TeamPerformanceService` la lisent.
- [x] Tests dans `DashboardAgentTest` et `TeamPerformanceTest`.

## Critères d'acceptation

- [x] AC1 — À 14:00, une tâche ouverte due à 09:00 le jour même compte « du jour » et pas « en retard » au tableau de bord de l'agent ; une tâche due la veille compte « en retard ».
- [x] AC2 — Le compte « en retard » du tableau de bord est celui que rend `filter[due]=overdue` sur le même jeu.
- [x] AC3 — La colonne `tasks_overdue` de la performance d'équipe ne compte pas une tâche due plus tôt dans la journée, et compte celle de la veille.

## Hors périmètre

- Les autres mots de l'angle 198 (P198.02 à P198.05), à valider par le porteur.

## Notes d'implémentation

- Ablation : les trois fichiers de `app/` remis à leur état d'avant → les deux tests neufs rouges (« 2 is identical to 1 ») ; correctif remis → verts.

---
id: TCK-1302
title: "Les tâches et les alertes de seuil se trient par rang de priorité et de gravité"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1260, TCK-1296]
blocks: []
spec_refs:
  features:
    - "docs/features.md#24-recherche--filtres"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-134--tris-sur-une-colonne-denum-rangée-en-chaîne"
tags: [back, sort, tasks, alerts, pistes]
---

## Contexte

Réf : **P134.03** du fichier de pistes, `validé (délégué)` (V7 accordé). Entrée dans le lot de
l'angle 118 par famille : son `Où` cite `Task.php` et `MaintenanceRequest.php`, que cite aussi
P118.03. `sort=priority` des tâches et `sort=severity` des alertes de seuil triaient la chaîne.

## Décision du porteur (déléguée)

`GET /api/tasks?sort=priority` et `GET /api/threshold-alerts?sort=severity` trient par rang (`low` < `medium` < `high` dans l'ordre de `TaskPriority::cases()`, en reprenant `TaskPrioritySort` de TCK-1260 ; `info` < `warning` < `critical` pour les alertes), sur le modèle de l'`orderBySeverity` de TCK-1126 ; un test par route, `sort=priority` et `sort=-priority` ; reste : les tris `status` (retrait ou rang d'un cycle de vie), `level` de `PlatformProfile`, la classe générique `EnumRankSort` et la garde sur toute colonne d'enum triable

## Reste à faire

les tris `status` (retrait ou rang d'un cycle de vie), `level` de `PlatformProfile`, la classe générique `EnumRankSort` et la garde sur toute colonne d'enum triable

## Objectif utilisateur

Un écran qui trie les tâches par priorité, ou les alertes par gravité, reçoit l'ordre que le nom
du tri promet.

## Contrat de données

- `GET /api/tasks?sort=priority` : `low` < `medium` < `high` (rang de `TaskPriority::cases()`,
  `TaskPrioritySort` de TCK-1260) ; `sort=-priority` à l'inverse.
- `GET /api/threshold-alerts?sort=severity` : `info` < `warning` < `critical` ;
  `sort=-severity` à l'inverse.

## Contraintes strictes (métier)

Aucun autre tri ne change ; un `sort=` inconnu reste refusé comme avant.

## Delta à produire

- [x] `HasQueryBuilder::customQuerySorts()` : point d'extension des tris qui ne sont pas une colonne
  brute, à côté de `$requestSortable` (même forme que `customQueryFilters()`).
- [x] `Task` : `priority` quitte `$requestSortable`, et se trie par `TaskPrioritySort`.
- [x] `ThresholdAlert` : `severity` quitte `$requestSortable`, et se trie par
  `App\Sorts\ThresholdAlertSeveritySort` (forme de TCK-1126).
- [x] `DepartageQueryBuilder` (TCK-1296) lit le sens d'un tri brut à la fin de son SQL.
- [x] Test : `TrisParRangTest`.

## Critères d'acceptation

- [x] AC1 — `sort=priority` rend `low, medium, high` ; `sort=-priority` rend `high, medium, low`.
- [x] AC2 — `sort=severity` rend `info, warning, critical` ; `sort=-severity` l'inverse.
- [x] AC3 — Des tâches de même priorité se départagent par `id` dans le sens du tri demandé.

## Hors périmètre

- Ce que le reste ci-dessus garde pour plus tard.

## Notes d'implémentation

- Un tri déclaré à la fois dans `$requestSortable` et en tri personnalisé serait servi par le
  premier (`SortsQuery::findSort`) : les deux noms quittent donc la liste de chaînes.
- Le départage de TCK-1296 rangeait par `id` croissant derrière un tri brut (pas de `direction`) :
  sous `sort=-priority`, les égaux sortaient à rebours du tri. Il lit désormais `DESC` en fin de SQL.
- Ablation : modèles, trait et départage rendus à `HEAD` → 2 rouges (AC1, AC2) ; le seul
  départage rendu à `HEAD` → 1 rouge (AC3) ; correctif remis → 3/3 verts.

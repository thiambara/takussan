---
id: TCK-1304
title: "Le tri par priorité des maintenances dérive son rang de l'enum, et il est épinglé par un test"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1296]
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-134--tris-sur-une-colonne-denum-rangée-en-chaîne"
tags: [back, sort, maintenance, pistes]
---

## Contexte

Réf : **P134.04** du fichier de pistes, `retenu · autonome` (A5). Entrée dans le lot par l'angle
134, celui de P134.03. `MaintenancePrioritySort` recopiait les valeurs de `MaintenancePriority`
en dur, et aucun test n'appelait `sort=priority`. Le `CASE` inversé (`ASC` pour `-priority`) faisait
en outre ranger les égaux par `id` croissant sous `-priority`, à rebours du tri (départage de
TCK-1296, qui lit le sens à la fin du SQL brut).

## Objectif utilisateur

Le tri par priorité des demandes de maintenance reste juste quand l'enum évolue.

## Contrat de données

Inchangé : `sort=-priority` rend `urgent, high, normal, low`, `sort=priority` l'inverse.

## Contraintes strictes (métier)

Aucun changement d'ordre entre priorités différentes.

## Delta à produire

- [x] `MaintenancePrioritySort` : rangs pris de `MaintenancePriority::cases()`, `CASE … DESC` pour
  `-priority`, sur la forme de `TaskPrioritySort`.
- [x] Test : `MaintenancePrioritySortTest`.

## Critères d'acceptation

- [x] AC1 — `sort=-priority` sur quatre demandes rend `urgent, high, normal, low` ; `sort=priority`
  l'inverse.
- [x] AC2 — Trois demandes de même priorité se départagent par `id` dans le sens du tri.

## Hors périmètre

- La classe générique `EnumRankSort` (reste de P134.03).
- Le tri par défaut de `MaintenanceRequestController` : `defaultSorts('-priority', …)` passe une
  chaîne, que spatie sert par un tri de colonne (`AllowedSort::field`) et non par ce tri par rang
  (lu, `SortsQuery::defaultSorts`) — vu au passage, non corrigé ici.

## Notes d'implémentation

- AC1 était déjà vert avant le correctif : il épingle le tri existant. AC2 rougit sans le correctif.
- Ablation : classe rendue à `HEAD` → 1 rouge (AC2) ; correctif remis → 3/3 verts.

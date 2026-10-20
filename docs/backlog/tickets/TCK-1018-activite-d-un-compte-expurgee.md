---
id: TCK-1018
title: "L'activité d'un compte dans la console passe par PropertyRedactor, et le témoin de l'export d'audit vit sous attribute_changes"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#26-audit--traçabilité"
  models:
    - "docs/models-spec.md#13-activitylog--remplacé-par-spatielaravel-activitylog"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-56--lecteurs-dactivity_log-restés-sur-properties-depuis-activitylog-v5"
tags: [api, privacy, activity-log, admin, pistes]
---

## Contexte

Réf : **P56.05** du fichier de pistes, `validé` (V3 accordé). `UserDetailController::activity()`
(`GET /api/admin/users/{id}/activity`) rendait `properties` brut, quand les trois autres lectures
du journal le passent par `PropertyRedactor`. Le témoin d'expurgation de
`CrossTenantAuditExportTest` était posé sous `properties.attributes`, forme qu'aucun événement de
modèle n'écrit depuis activitylog v5. Re-mesuré le 2026-10-20 sur `pre-dev` 35d861d57 : une ligne
`withProperties(['target_email' => …])` dont le compte est le sujet sortait en clair.

## Décision du porteur

> passer `UserDetailController::activity()` par `PropertyRedactor`, comme les trois autres lectures, et poser le témoin de `CrossTenantAuditExportTest` sous `attribute_changes` (porteur, 2026-10-19)

## Objectif

Aucune lecture du journal ne rend `properties` sans expurgation, et le test de l'export d'audit
garde l'expurgation de la forme réelle du diff.

## Delta à produire

- [x] `UserDetailController::activity()` : `properties` passé par `PropertyRedactor::redact()`.
- [x] `UserDetailTest::test_activity_endpoint_redacts_properties`.
- [x] `CrossTenantAuditExportTest::seedLogs()` : témoin `rib` écrit par `withChanges()`, sous
      `attribute_changes`.

## Critères d'acceptation

- [x] AC1 — Une ligne dont le compte est le sujet, `properties.target_email` témoin : la réponse
      porte `[REDACTED]`, la clé non sensible (`reason`) reste lisible.
- [x] AC2 — `CrossTenantAuditExportTest` rougit si l'export cesse d'expurger `attribute_changes`.

## Hors périmètre

- Rendre `attribute_changes` dans les lectures du journal (P56.03, refusé par le porteur).

## Notes d'implémentation

- Avant correctif : `data.0.properties.target_email` en clair.
- Ablation (contrôleur remis sur `$log->properties?->toArray()`) → rouge ; remis → `UserDetailTest`
  8 verts.
- Témoin : expurgation d'`attribute_changes` retirée d'`ActivityLogExporter` → rouge
  (`RIBTEMOIN` dans le CSV) avec le témoin neuf, **vert** avec l'ancien témoin sous `properties` :
  le test ne gardait pas ce chemin. Remis → `CrossTenantAuditExportTest` 5 verts.

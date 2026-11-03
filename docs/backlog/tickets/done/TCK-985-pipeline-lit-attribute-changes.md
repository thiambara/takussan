---
id: TCK-985
title: "Les indicateurs d'étape du pipeline CRM lisent le diff là où activitylog v5 l'écrit"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#13-activitylog--remplacé-par-spatielaravel-activitylog"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-56--lecteurs-dactivity_log-restés-sur-properties-depuis-activitylog-v5"
tags: [api, crm, activity-log, pistes]
---

## Contexte

Réf : **P56.01** du fichier de pistes, `retenu · autonome` (A1). `PipelineStatsService` calcule
`stage_changes_last_30d` et `avg_time_in_stage` (TCK-083) en lisant
`properties->'old'` et `properties->'attributes'` du journal d'activité. Depuis activitylog v5
(installé dès la création de la table), le diff d'un événement de modèle vit dans
`attribute_changes` et `properties` vaut `[]` : les deux indicateurs ont toujours valu 0.
Re-mesuré le 2026-10-19 sur `pre-dev` 0486616a3 par le test de garde ci-dessous : avant correctif,
`stage_changes_last_30d = 0` pour deux changements d'étape.

Ce correctif est aussi le point 3 de TCK-617 (`todo`, contrainte 3 : « Le pipeline lit
`attribute_changes` ») ; TCK-617 n'est pas modifié ici.

## Objectif

Les deux indicateurs de la barre du pipeline comptent les changements d'étape réellement
journalisés.

## Delta à produire

- [x] `PipelineStatsService` : les constantes `PIPELINE_STAGE_OLD` / `PIPELINE_STAGE_NEW` lisent
      `attribute_changes`.
- [x] `stageChangesLast30Days()` : ne compte que les lignes à `old.pipeline_stage` non nul (la
      ligne `created` porte aussi `attributes.pipeline_stage`).
- [x] Docblock de `stageChangesLast30Days()` : nomme `attribute_changes` (volet docblock de P56.04).
- [x] `CustomerPipelineTest::test_pipeline_stats_compute_stage_changes_and_time_in_stage_from_the_activity_log`.

## Critères d'acceptation

- [x] AC1 — Un client créé en `lead`, passé en `qualified` deux jours plus tard puis revenu en
      `lead` trois jours après : `stage_changes_last_30d = 2`.
- [x] AC2 — Pour ce même client : `avg_time_in_stage.lead = 2.0`, `avg_time_in_stage.qualified = 3.0`.

## Hypothèses (mode sans humain)

- La durée en étape garde son ancre sur la ligne `created` (première entrée en étape), comme le
  code l'écrivait déjà ; seul le compte des changements exclut cette ligne.

## Hors périmètre

- La spec (`docs/models-spec.md` § 13, `changes → properties`) : P56.04, chemin fermé à
  l'implémenteur.
- Les autres lecteurs d'`activity_log` (P56.02, P56.03, P56.05), soumis au porteur.

## Notes d'implémentation

- Avant correctif : le test rend `0` au lieu de `2`.
- Ablation 1 : constantes remises sur `properties` → rouge (`0` au lieu de `2`).
- Ablation 2 : filtre `old IS NOT NULL` retiré → rouge (`3` au lieu de `2` : la ligne `created`
  serait comptée comme un changement). Correctif remis → `CustomerPipelineTest` 12 verts.

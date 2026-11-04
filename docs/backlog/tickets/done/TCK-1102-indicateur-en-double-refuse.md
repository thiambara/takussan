---
id: TCK-1102
title: "Un indicateur déjà configuré pour l'agence se refuse en 422, plus en 500"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#64-kpiconfig-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-92--contraintes-unique-sans-garde--doublon-rendu-en-500"
tags: [back, tableaux-de-bord, validation, pistes]
---

## Contexte

Réf : **P92.03** du fichier de pistes, `validé (délégué)` (critère accordé : V7, l'issue du second
envoi — refus ou écrasement — était un choix de produit).

`kpi_configs` porte `unique(agency_id, metric)` (« un KPI au plus une fois par agence »,
models-spec § 64), mais `metric` n'était jugé que par `Rule::in`, à la création comme à la
modification : le doublon atteignait la contrainte, que `bootstrap/app.php` ne rend pas, soit 500.

### Décision du porteur (déléguée)

> refuser le doublon : `Rule::unique('kpi_configs', 'metric')->where('agency_id', <l'agence résolue comme dans `store`>)` à la création, et `->where('agency_id', <agence de l'indicateur>)->ignore(<l'indicateur>)` à la modification, soit 422 sur `metric` avec le message `validation.unique` existant ; aucun `updateOrCreate`, aucun texte neuf ; test des deux 422 ; reste : retirer du sélecteur du front les métriques déjà configurées

### Reste à faire

> retirer du sélecteur du front les métriques déjà configurées

## Objectif utilisateur

L'admin d'agence qui choisit une seconde fois une métrique déjà configurée reçoit une erreur de
validation sur le champ, et non une panne serveur.

## Delta à produire

- [x] `StoreKpiConfigRequest` : `Rule::unique('kpi_configs', 'metric')` borné à l'agence que
      `KpiConfigController::store` résout (`agency_id` fourni, sinon celle de l'appelant).
- [x] `UpdateKpiConfigRequest` : même règle bornée à l'agence de l'indicateur, `->ignore()` de
      l'indicateur modifié.
- [x] Test `tests/Feature/Dashboard/KpiConfigDuplicateTest.php`.

## Critères d'acceptation

- [x] AC1 — deux `POST /api/kpi-configs` de même métrique pour une agence : 201 puis 422 sur
      `metric`, une seule ligne en base.
- [x] AC2 — en super-admin, le doublon est jugé sur l'agence désignée (422) ; la même métrique dans
      une autre agence reste acceptée (201).
- [x] AC3 — `PUT /api/kpi-configs/{id}` vers la métrique d'un autre indicateur de l'agence : 422 sur
      `metric` ; garder sa propre métrique : 200.

## Hors périmètre

- Le reste ci-dessus, gardé par le porteur.
- Aucun `updateOrCreate`, aucun texte neuf (le message est `validation.unique`).

## Notes d'implémentation

- Reproduction avant correctif : les trois tests rendent 500 (`kpi_configs_agency_id_metric_unique`).
- Ablation : les deux FormRequest rendues à `HEAD` → 3 rouges sur 3 (500) ; correctif remis → 3/3.

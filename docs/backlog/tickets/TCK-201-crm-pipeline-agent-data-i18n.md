---
id: TCK-201
title: "Pipeline CRM agent — données vides et libellés anglais"
status: done
phase: P1
family: bug
estimate: M
created: 2026-05-06
updated: 2026-05-06
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#16-crm--relation-client
    - docs/features.md#28-internationalisation--préférences
  models:
    - docs/models-spec.md#7-customer
    - docs/models-spec.md#32-task-
tags: [front, back, bug, crm, pipeline, i18n, agent-immobilier, smoke-test-2026-05-06]
---

## Objectif utilisateur

Un agent utilise `/app/crm/pipeline` pour voir et déplacer ses prospects par étape en français.

## Contrat de données

Le pipeline repose sur `Customer.pipeline_stage`, les relations agent/client et les métriques de conversion. La page doit afficher les Customers correspondant au compteur de prospects actifs.

## Direction UX / Artistique

Kanban métier lisible, libellés français, colonnes équilibrées, états vides précis uniquement quand une étape est réellement vide.

## Contraintes strictes (métier)

- Le compteur global et le contenu des colonnes doivent provenir du même scope.
- Les mutations de stage doivent être optimistes seulement si rollback prévu.
- Les labels utilisateur ne doivent pas exposer les valeurs enum anglaises.

## Delta à produire

- [ ] Corriger l'incohérence `Active prospects 104` avec toutes les colonnes à `0`.
- [ ] Vérifier le scope API et les filtres utilisés par la page pipeline.
- [ ] Localiser les titres, métriques et empty states du pipeline.
- [ ] Ajouter tests sur pipeline non vide, pipeline vide et changement de stage.
- [ ] Ajouter assertion d'absence des chaînes anglaises observées en locale FR.

## Critères d'acceptation

- [ ] Des clients actifs apparaissent dans les colonnes correspondant à leur stage.
- [ ] Le total affiché correspond à la somme ou à la règle documentée des colonnes.
- [ ] La page ne rend plus `Prospect pipeline`, `Active prospects`, `No customers`, `Qualified`, `Negotiating`, `Converted`, `Lost` en locale FR.
- [ ] Déplacer un client met à jour son stage ou rollback avec erreur lisible.

## Hors périmètre

- Campagnes email/SMS.
- Nouvelle modélisation des stages CRM.
- Refonte complète de la fiche client.

## Notes d'implémentation

Count includes are registered with the documented `*Count` suffix in the shared Spatie query-builder helper; this fixes `include=tasksCount` for the pipeline and keeps the API convention aligned with `docs/spatie-query-builder.md`.

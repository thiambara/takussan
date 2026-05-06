---
id: TCK-200
title: "Dashboard agent — widgets opérationnels manquants"
status: todo
phase: P1
family: front
estimate: M
created: 2026-05-06
updated: 2026-05-06
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#16-crm--relation-client
  models:
    - docs/models-spec.md#32-task-
    - docs/models-spec.md#7-customer
    - docs/models-spec.md#17-propertyvisit-
tags: [front, dashboard, agent-immobilier, smoke-test-2026-05-06]
---

## Objectif utilisateur

Un agent ouvre `/app/overview/agent` et voit ses priorités de travail immédiates, pas seulement des graphiques agrégés.

## Contrat de données

Le dashboard agent agrège les métriques de pipeline, commissions, tâches, activité récente et visites. Les widgets doivent consommer des endpoints adaptés ou des blocs déjà exposés par les endpoints dashboard, avec fieldsets réduits.

## Direction UX / Artistique

Dashboard de travail : tâches et visites imminentes en haut, indicateurs courts, listes actionnables et liens directs vers clients/biens.

## Contraintes strictes (métier)

- Les données restent scoped à l'agence et au profil agent actif.
- Aucun chiffre fictif.
- Les tâches doivent être triées par échéance et priorité.
- Les liens de widget doivent pointer vers des fiches accessibles.

## Delta à produire

- [ ] Ajouter widget pipeline opérationnel avec demandes en attente, baux à signer et tâches du jour.
- [ ] Ajouter widget commissions mois et cumul annuel si les données sont disponibles.
- [ ] Ajouter widget tâches assignées avec priorité, échéance et lien client.
- [ ] Ajouter widget activité récente.
- [ ] Ajouter widget visites du jour.
- [ ] Ajouter états vides et tests de rendu avec données présentes/absentes.

## Critères d'acceptation

- [ ] `/app/overview/agent` couvre les attentes de `TC-AGT-02`.
- [ ] Chaque widget actionnable a au moins un lien vers la ressource concernée.
- [ ] Les widgets vides expliquent l'état sans faux chiffres.
- [ ] Les données visibles sont limitées à l'agence/profil actif.

## Hors périmètre

- KPI personnalisables par agence.
- Export de reporting.
- Refonte du dashboard global `/app`.

## Notes d'implémentation

_(à remplir par implementing-specs)_

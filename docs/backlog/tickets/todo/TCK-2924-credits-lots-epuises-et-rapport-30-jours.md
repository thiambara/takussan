---
id: TCK-2924
title: "Crédits : les lots épuisés ou expirés, et le rapport des mises en avant sur 30 jours"
status: todo
phase: P2
family: back
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2925]
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#95-creditlot-"
    - "docs/models-spec.md#94-propertyboostdailystat-"
tags: [back, credits, boost, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

L'agence retrouve ses lots de crédits épuisés ou expirés et lit, sur 30 jours, ce que ses mises en avant ont rapporté.

## Contrat de données

Relevé du 2026-11-15 : `GET /api/credits` (`Credits/CreditController.php:27`) ne rend que les lots `spendable()` ; aucune route ne rend les lots épuisés ou expirés. Les mesures journalières des mises en avant existent (`property_boost_daily_stats`) mais aucune route ne les rend en série sur 30 jours. Écarts acceptés de TCK-2664 (« Rapport des 30 derniers jours », « Lots épuisés ou expirés »), sans ticket.

- `GET /api/credits/lots?filter[state]=spent|expired` : les lots non dépensables de l'espace actif, paginés, triés du plus récent.
- `GET /api/credits/boosts/report?days=30` : par jour, impressions, clics (et vues de fiche si TCK-2923 est fusionné : sinon le champ est absent) ; par mise en avant, les totaux de la période.

## Contraintes strictes (métier)

- Même espace et même autorisation que `GET /api/credits` (ADR-0061).
- `days` borné (7, 30, 90) ; toute autre valeur → 422.
- Sparse fieldsets et pagination selon `docs/spatie-query-builder.md`.

## Delta à produire

- [ ] Route `GET /api/credits/lots` (`Credits/CreditLotController@index`), scopes `spent()` et `expired()` sur `CreditLot`.
- [ ] Route et contrôleur du rapport (`CreditBoostReportController`).
- [ ] Tests : `CreditLotsHistoryTest`, `CreditBoostReportTest`.

## Critères d'acceptation

- [ ] AC1 — Un lot à solde 0 et un lot expiré de l'espace A paraissent dans `filter[state]=spent` et `filter[state]=expired` respectivement ; un lot encore dépensable n'y paraît pas ; un lot de l'espace B jamais.
- [ ] AC2 — `GET /api/credits/boosts/report?days=30` rend 30 jours consécutifs (jours sans mesure à 0) et des totaux par mise en avant égaux à la somme des jours ; `days=12` → 422.
- [ ] AC3 — Un appelant sans accès au portefeuille de l'espace reçoit la même réponse que sur `GET /api/credits` (403 / 422 `credits.no_space`).

## Hors périmètre

- L'écran (TCK-2925). La série des vues de fiche (TCK-2923).

## Notes d'implémentation

_(à remplir par implementing-specs)_

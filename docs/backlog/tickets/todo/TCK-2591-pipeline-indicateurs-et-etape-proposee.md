---
id: TCK-2591
title: "Pipeline : des indicateurs datés par le journal d'étapes, une portée « Moi / Agence », et l'étape suivante proposée par les événements"
status: todo
phase: P1
family: back
estimate: M
wave: 89
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2578, TCK-2579, TCK-2588]
blocks: [TCK-2592]
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#7-customer"
tags: [back, crm, pipeline, reporting, audit-ux, app, adr]
---

## Objectif utilisateur

L'admin pilote sur des chiffres justes et filtrables par agent ; l'agent ne déplace plus ses cartes à la main : Takussan lui propose l'étape que les faits justifient, il confirme d'un geste (décision 11a).

## Contrat de données

**Re-mesuré sur `1bce3798a`** (`PipelineStatsService.php`) :
- `stage_changes_last_30d` lit bien `attribute_changes` (`:111-136`) — **le point 3 de TCK-617 est déjà corrigé** (P56.01) ;
- `conversion_rate` (`:212-238`) compte les fiches **actuellement** `converted`/`lost` dont `updated_at` a moins de 30 jours : toute retouche d'une vieille fiche gagnée gonfle le taux — **défaut confirmé** ;
- `avg_time_in_stage` est une moyenne (pas une médiane) ; le front n'en montre qu'une étape ;
- portée : `visibleTo($user)` + `status = active` (`:58-64`) ; ni « Moi », ni filtre de référent, d'étiquette ou de recherche ; `GET customers/pipeline-stats` ne prend aucun paramètre (`CustomerController.php:326-331`).

À créer (règles : [ADR-0103](../../../adr/0103-le-pilotage-commercial-se-derive-des-gestes-et-des-faits.md)) :
- `GET /api/customers/pipeline-stats` accepte `scope=mine|agency` (`mine` = `filter[referent]=me` de TCK-2588 ; `agency` exige `crm.view_all`) et les mêmes filtres que la liste (`referent`, `tags`, `search`, `follow_up`).
- `conversion_rate` = sorties **datées par le journal** : passages vers `converted` / (vers `converted` + vers `lost`) dans les 30 derniers jours, d'après `attribute_changes` ; `exits_last_30d = {converted, lost}` servi à côté.
- `median_days_in_stage` pour les six étapes (médiane des durées tirées du journal) ; `avg_time_in_stage` gardé pour compatibilité.
- `suggested_stage` sur `CustomerResource` (demandé par `fields[customers]`) : `{to, reason, at}` ou `null`, calculé d'après le dernier événement **postérieur** au dernier changement d'étape :
  - visite confirmée → `prospect` (depuis `lead`) ;
  - compte rendu `interested` → `qualified` (depuis `lead`/`prospect`, cf. TCK-2578) ;
  - candidature ou offre créée (TCK-2579) → `negotiating` (depuis une étape antérieure) ;
  - bail signé → `converted` (depuis toute étape vivante) ;
  - jamais vers `lost`, jamais en arrière ; une proposition écartée (« Plus tard ») ne revient pas pour le même événement.
- `POST /api/customers/{customer}/suggested-stage/dismiss` (`{reason_event}`) : écarte la proposition courante (journalisé).

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0102](../../../adr/0102-une-reservation-porte-sa-nature.md).
- **Aucune étape ne change sans geste** : `suggested_stage` est une lecture ; le passage reste `PATCH …/pipeline-stage` (motif exigé pour `converted` et `lost`, note épinglée — inchangé).
- `scope=agency` : 403 sans `crm.view_all` ; `mine` par défaut pour un agent, `agency` pour l'admin (règle de la maquette retenue ; le front choisit, l'API applique).
- Les chiffres d'une portée ne lisent que les fiches de cette portée dans l'agence active.
- Le calcul des propositions tient en requêtes groupées sur la page (pas une requête par fiche).

## Delta à produire

- [ ] `PipelineStatsService` : portée et filtres, conversion sur sorties datées, médianes ; `PipelineStatsRequest`.
- [ ] `CustomerSuggestedStageQuery` + attribut `suggested_stage` ; route `suggested-stage/dismiss` (`DismissSuggestedStageRequest`, `CustomerPolicy::update`).
- [ ] Tests : `PipelineConversionRateTest` (**retouche d'une fiche gagnée il y a 60 j ne change pas le taux** ; sorties du mois comptées), `PipelineMedianDurationTest`, `PipelineStatsScopeTest` (`mine`, `agency` 403 sans capacité), `CustomerSuggestedStageTest` (quatre événements, jamais en arrière, écartée ne revient pas, nouvelle proposition après un nouvel événement), `SuggestedStageQueryCountTest`.

## Critères d'acceptation

- [ ] AC1 (rouge sur `1bce3798a`) — Une fiche passée en `converted` il y a 60 jours puis retouchée aujourd'hui (téléphone modifié) ne compte pas dans `conversion_rate` ; deux passages vers `converted` et un vers `lost` ce mois-ci donnent `0.6667` et `exits_last_30d = {converted: 2, lost: 1}`.
- [ ] AC2 — `median_days_in_stage` rend une valeur pour chacune des six étapes sur un jeu de journal connu.
- [ ] AC3 — `scope=mine` pour l'agent Sokhna Sène rend les compteurs de ses seules fiches (38 sur la donnée de la maquette, test sur un jeu construit) ; `scope=agency` par un agent sans `crm.view_all` : 403.
- [ ] AC4 — Après une visite confirmée de Mouhamed (étape `lead`), sa fiche porte `suggested_stage = {to: prospect, reason: visit_confirmed}` ; après `dismiss`, `null` ; après un compte rendu `interested`, `{to: qualified}`.
- [ ] AC5 — Une candidature saisie pour une fiche `qualified` propose `negotiating` ; une fiche `negotiating` dont une visite est confirmée ne se voit rien proposer.
- [ ] Ablations consignées (AC1, AC4).

## Hors périmètre

- L'écran du pipeline et le vocabulaire (TCK-2592).
- Le passage automatique sans confirmation (décision 11a : non).
- Le reste de TCK-617 (cloisonnement du tableau de bord, liens d'agenda, libellé de `calendar.feed_*`) : non touché.

## Notes d'implémentation

_(à remplir par implementing-specs)_

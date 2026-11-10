---
id: TCK-2626
title: "Rapports, côté API : une occupation du bailleur qui se lit avec sa base, et les demandes traitées par agent"
status: todo
phase: P1
family: back
estimate: M
wave: 87
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2629]
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
    - "docs/features.md#16-crm--relation-client"
  models: []
tags: [back, reporting, dashboard, bailleur, audit-ux, app]
---

## Objectif utilisateur

- Le bailleur ne lit plus, sur le même écran, « 54 biens disponibles » et « Taux d'occupation 100 % ». L'occupation dit sur combien de biens elle se calcule, et ne compte pas un bail fini.
- L'admin voit, par agent, combien de demandes chacun a traitées dans le mois, à côté des visites et des baux.

## Contrat de données

Relevé sur `dev` (1bce3798a) le 2026-11-10, par lecture du code. La cause chiffrée est à confirmer par la mesure du Delta.

**Bases différentes sur le même écran du bailleur** (`DashboardOwnerService::summary`) :

- `portfolio.total`, `rented` et `available` comptent **tous** les biens du bailleur hors brouillon, archivé, en revue, refusé et vendu, **quel que soit** le contrat (vente, location courte durée) et qu'ils soient feuilles ou parents (`:39-47`).
- `occupancy.rate_percent` (`PortfolioMetrics::longStayOccupancyToday`) se calcule sur les seuls biens **éligibles** : feuilles, `contract_type = rent`, `rent_period` mensuel ou annuel.

Un bailleur à 5 biens en location longue durée tous loués, et à 54 biens en vente ou en courte durée, lit donc « 54 dispo » et « 100 % ». **L'API ne rend pas la base** (`eligible_count`), et le front ne peut pas l'écrire.

**Un bail fini peut compter comme occupant aujourd'hui.**

- Les statuts exclus sont seulement `draft` et `pending_signature` (`NON_OCCUPYING_LEASE_STATUSES`).
- La fin effective est `LEAST(end_date, terminated_at)`.
- Un bail `terminated` sans `terminated_at`, ou `expired` avec une `end_date` à venir, occupe donc encore son bien aujourd'hui. Pour « aujourd'hui », la règle de « Baux actifs » est `Lease::ONGOING_STATUSES` (`active`, `terminating`) : les deux chiffres voisins ne comptent pas les mêmes baux.

**Équipe** : `team-performance` rend `leases_signed`, `sales_signed`, `visits_completed`, `customers_added`, `commissions_earned`, `properties_managed` et `tasks_overdue`. **Pas de demandes traitées.** Le délai de réponse vient de la famille 5 (`contact-leads/response-stats`), non recopié ici.

## Direction UX / Artistique

Sans objet (ticket API). Écrans servis : TCK-2628 et TCK-2629 (« Vue d'ensemble » du bailleur, onglet « Équipe »).

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0096](../../../adr/0096-l-accueil-est-la-journee-et-les-rapports-sont-une-page.md).
- **L'occupation du jour** :
  - ne compte que les baux `active` et `terminating`, comme « Baux actifs » ;
  - la série mensuelle passée garde sa règle (TCK-1173 : archiver ou vendre ne réécrit pas janvier), puisqu'un bail résilié a bien occupé les jours d'avant sa fin.
- **La base est rendue avec le taux** : `eligible_count` et `occupied_count`, et `rate_percent` = `occupied_count / eligible_count`. `null` sans bien éligible : « rien à occuper » n'est pas « tout vacant » (TCK-1114).
- **Les clés existantes ne changent ni de nom ni de sens** :
  - `portfolio.*` ;
  - `occupancy.rate_percent` ;
  - `occupancy.short_stay_percent`.

  On n'ajoute que des clés.
- La Vue agence (`DashboardAgencyService`) emploie la même mesure du jour. Elle suit la même règle, et le même test la couvre.
- **Demandes traitées par agent** : `PropertyContactLead` dont `handled_by_id` est l'agent et `handled_at` tombe dans la période. Même période et même fuseau (`Africa/Dakar`) que les autres colonnes. Une requête pour toute l'équipe.
- Codes et nombres seulement (principe 5).

## Delta à produire

- [ ] **Mesure d'abord** : sur la base d'essai, relever pour le bailleur de la capture `prop-ov-d-1.png` les comptes par `contract_type`, `rent_period`, feuille ou parent, et les baux qui occupent aujourd'hui par statut. Écrire le relevé dans les notes d'implémentation avant tout correctif.
- [ ] `PortfolioMetrics::longStayOccupancyToday` : statuts occupants du jour = `Lease::ONGOING_STATUSES`. Rend `{rate_percent, eligible_count, occupied_count}`.
- [ ] `DashboardOwnerService::summary` et `DashboardAgencyService` : `occupancy.eligible_count` et `occupancy.occupied_count`.
- [ ] `TeamPerformanceService` : `leads_handled` par agent.
- [ ] Tests :
  - `OwnerOccupancyBaseTest` : 5 biens éligibles loués, plus 3 en vente, donnent `eligible_count = 5`, `occupied_count = 5` et `portfolio.total = 8` ;
  - `OccupancyTodayExcludesEndedLeasesTest` : bail `terminated` sans `terminated_at` et `end_date` à venir non compté ;
  - la série mensuelle d'un mois passé inchangée (non-régression TCK-1173) ;
  - `TeamPerformanceLeadsHandledTest`.

## Critères d'acceptation

- [ ] AC1 — Bailleur à 5 biens en location mensuelle (tous sous bail `active`) et à 3 biens en vente disponibles : `dashboard/owner` rend `occupancy.rate_percent = 100`, `eligible_count = 5`, `occupied_count = 5`, et `portfolio.available = 3`.
- [ ] AC2 — Le même bailleur dont un bail passe à `terminated` sans `terminated_at`, avec une `end_date` dans six mois : `occupied_count = 4` et `rate_percent = 80`. Le mois précédent de la série reste à 100.
- [ ] AC3 — Ablation : remettre `NON_OCCUPYING_LEASE_STATUSES` dans la mesure du jour fait rougir AC2.
- [ ] AC4 — Agent qui a traité 3 demandes en novembre et 1 en octobre : `team-performance?period=2026-11` rend `leads_handled = 3`.

## Hors périmètre

- Le délai de première réponse par agent (famille 5).
- Les impayés par échéance et la dernière relance (famille 6, `payments/history` et `lease-payments/{id}/reminders`) : l'onglet « Impayés » de Rapports les lit, sans route à lui.
- Le libellé du chiffre (TCK-2628, TCK-2629).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_

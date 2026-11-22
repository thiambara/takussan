---
id: TCK-2626
title: "Rapports, côté API : une occupation du bailleur qui se lit avec sa base, et les demandes traitées par agent"
status: done
phase: P1
family: back
estimate: M
wave: 87
created: 2026-11-10
updated: 2026-11-11
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

**Relevé avant correctif** (base de démo, 2026-11-11 01:33 UTC, `owner1@dakarimmo.sn`, user 8, borne `PortfolioScope::landlord`) — la cause du « 54 dispo · 100 % » n'est PAS celle que supposait le Contrat de données :

| `contract_type` | `rent_period` | feuille | statut exclu | biens |
|---|---|---|---|---|
| rent | monthly | oui | non | **2** |
| rent | `NULL` | oui | non | **55** |
| rent | `NULL` | oui | oui | 6 |
| sale | `NULL` | oui | non | 8 |
| sale | `NULL` | oui | oui | 1 |

- Aucun parent. Statuts : 54 `available`, 5 `rented`, 3 `under_maintenance`, 2 `draft`, 2 `sold`, et un de chaque pour `archived`, `pending`, `pending_review`, `published`, `rejected` et `unavailable`.
- Baux qui couvrent aujourd'hui par leurs dates (règle d'avant, tous statuts) : 13, tous `active`. Baux du bailleur : 14 `active`, 1 `draft`, 1 `terminated`. **Aucun bail fini ne comptait comme occupant ce jour-là.**
- Biens éligibles couverts aujourd'hui : 2, sous bail `active`. `longStayOccupancyToday` = 100, soit 2 sur 2.
- **La vraie cause : 55 biens en location sur 57 ont `rent_period` NULL**, donc aucun n'est éligible. Sur tout le parc de démo, 381 biens `rent` sur 451 sont dans ce cas. Pourtant `Property::saving` pose `monthly` par défaut sur tout bien `rent` sans périodicité (`app/Models/Property.php:178-183`). Ces lignes ont donc été écrites sans passer par le modèle (insertion brute des seeders). La base rendue ici écrira « 100 % · 2 sur 2 » à côté des 54 disponibles. Le défaut de données est signalé dans le rapport, pas corrigé : l'éligibilité ne change pas de sens, ce que le ticket interdit.

**Ce qui est fait**

- `PortfolioMetrics::longStayOccupancyToday` rend `{rate_percent, eligible_count, occupied_count}`. Aujourd'hui, seuls les baux `Lease::ONGOING_STATUSES` occupent ; les placeholders sont dérivés de la constante. Il n'y a toujours qu'une requête : `DashboardQueryBudgetTest` est inchangé.
- La série mensuelle (`longStayOccupancy`) garde `NON_OCCUPYING_LEASE_STATUSES`. C'est prouvé par ablation C6 : appliquer la règle du jour à la série fait passer octobre à 80, et le test rougit.
- `DashboardOwnerService::summary` et `DashboardAgencyService` ajoutent `occupancy.eligible_count` et `occupancy.occupied_count`. Les clés existantes et `KpiResolver`/`OwnerMeMetrics` (qui lisent `rate_percent`) ne changent pas.
- `TeamPerformanceService` ajoute `leads_handled` : une requête groupée par `handled_by_id`, bornée à l'agence (`property_contact_leads.agency_id`) et au mois (`handled_at` entre les mêmes `$from`/`$to` que les autres colonnes). Tous les canaux comptent : le ticket n'en écarte aucun.
- **Fuseau** : les autres colonnes lisent le mois en `app.timezone` (UTC), et non en `Africa/Dakar` explicite. Dakar est en UTC+0 sans heure d'été, donc les bornes coïncident. `leads_handled` suit les autres colonnes, ce qui donne la même période. Si un jour le serveur n'est plus en UTC, toutes les colonnes de la ligne bougeront ensemble.

**Tests** :

- `OwnerOccupancyBaseTest` (2) ;
- `OccupancyTodayExcludesEndedLeasesTest` (4 : résilié sans `terminated_at`, expiré avant `end_date`, préavis qui occupe encore, Vue agence) ;
- `TeamPerformanceLeadsHandledTest` (4 : AC4, bornes à la seconde, autre agence, une seule requête quelle que soit l'équipe).

Ablations C1 à C11, toutes rouges puis restaurées (md5). C1 est AC3.

Voisins : 251 tests verts (dashboards, performance d'équipe, reversements, commissions, relevés).

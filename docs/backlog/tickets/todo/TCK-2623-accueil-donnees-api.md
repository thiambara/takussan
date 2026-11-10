---
id: TCK-2623
title: "Accueil, côté API : l'équipe aujourd'hui pour l'admin, les interventions d'un jour pour le prestataire, les loyers du mois reçus sur attendus pour le bailleur"
status: todo
phase: P1
family: back
estimate: M
wave: 87
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2624, TCK-2625]
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#1-user"
    - "docs/models-spec.md#21-maintenancerequest-"
tags: [back, accueil, dashboard, reporting, audit-ux, app]
---

## Objectif utilisateur

L'accueil sait dire trois choses qu'il ne sait pas dire aujourd'hui :

- à l'admin, qui de son équipe travaille aujourd'hui, avec combien de visites et de demandes ouvertes ;
- au prestataire, ses interventions du jour ;
- au bailleur, « Loyers de novembre : 8 reçus sur 14 ».

## Contrat de données

Relevé sur `dev` (1bce3798a) le 2026-11-10 :

- **Équipe** : `GET /api/agencies/{agency}/team-performance` (`Agency\TeamPerformanceController`, `authorize('viewReports', $agency)`) rend, par agent et **par mois** :
  - `leases_signed`, `sales_signed`, `visits_completed`, `customers_added` ;
  - `commissions_earned`, `properties_managed`, `tasks_overdue`.

  **Rien du jour** : ni visites prévues aujourd'hui, ni demandes ouvertes, ni absence. Les absences sont des `RoleDelegation` de rôle `absence_cover` (TCK-591, ADR-0035), lues par `GET agencies/{agency}/absences`.
- **Interventions** : `MaintenanceRequest::$requestFilterable` = `property_id, lease_id, requester_id, assigned_to, category, priority, status`. `scheduled_at` est triable, **pas filtrable**. Impossible de demander « mes interventions d'aujourd'hui ».
- **Bailleur** : `DashboardOwnerService::summary` rend :
  - `finance.expected_monthly` (un montant) ;
  - `overdue_count` et `overdue_amount` ;
  - `cashflow_month`.

  **Ni le nombre d'échéances du mois reçues, ni celui des échéances attendues.**

## Direction UX / Artistique

Sans objet (ticket API). Écrans servis : TCK-2624 (« Équipe aujourd'hui », « Loyers de novembre ») et TCK-2625 (prestataire).

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0096](../../../adr/0096-l-accueil-est-la-journee-et-les-rapports-sont-une-page.md).
- **Équipe aujourd'hui** :
  - même autorisation que `team-performance` (`viewReports`) : un agent reçoit 403 ;
  - périmètre : les profils agent **actifs** de l'agence ;
  - « aujourd'hui » se lit à l'heure de `Africa/Dakar`.
- **Absence en cours** : même définition que la lecture des absences (TCK-591), et que `current_absence` de la famille 6 si elle est livrée avant. Une seule règle, réutilisée et non recopiée.
- **Demandes ouvertes d'un agent** : `PropertyContactLead` dont il est le destinataire et que personne n'a traitée (`handled_at` nul), même définition que le compteur « Demandes de contact » du menu.
- **Plage `scheduled_at`** :
  - elle s'ajoute aux filtres existants sans changer leur sens ;
  - bornes incluses, dates lues à l'heure de Dakar ;
  - le cloisonnement du prestataire (il ne voit que ce qui lui est assigné) reste celui de la Policy actuelle.
- **Loyers du mois** : seules les échéances de **loyer** des baux du bailleur dont `due_date` tombe dans le mois courant comptent. Une restitution de caution n'est jamais une échéance (règle de « Ma situation »).
  - `received_count` : soldées.
  - `expected_count` : toutes, hors annulées.
- **Pas de N+1** : une requête par agrégat, quel que soit le nombre d'agents (règle de `PortfolioMetrics`).
- Codes et nombres seulement, aucun libellé (principe 5).

## Delta à produire

- [ ] `GET /api/agencies/{agency}/team-today` → `Agency\TeamTodayController` + `App\Services\Reporting\TeamTodayService`. Par agent :
  - `user_id`, `name`, `avatar_url` ;
  - `visits_today_count`, `first_visit_at` (ISO 8601 ou `null`) ;
  - `open_leads_count` ;
  - `current_absence {ends_at, substitute {id, name}} | null`.
- [ ] `MaintenanceRequest` : filtres `filter[scheduled_from]` et `filter[scheduled_to]` (dates), dans `$requestFilterable` et `$queryFields` ; ligne ajoutée à `docs/spatie-query-builder.md`.
- [ ] `DashboardOwnerService::summary` : `finance.rent_month {received_count, expected_count, received_amount}`, repris par `OwnerMeMetrics` pour `dashboard/me`.
- [ ] Tests :
  - `TeamTodayTest` : visites du jour à l'heure de Dakar, demandes ouvertes, absence en cours avec remplaçant, 403 pour un agent, agent inactif exclu, nombre de requêtes constant entre 2 et 6 agents ;
  - `MaintenanceScheduledRangeFilterTest` ;
  - `OwnerRentMonthTest` (caution exclue, échéance annulée exclue).

## Critères d'acceptation

- [ ] AC1 — Agence de trois agents. Awa a deux visites aujourd'hui (09:00 et 15:00, heure de Dakar) et une demande non traitée ; Ibrahima est absent jusqu'au 14 et remplacé par Khady. `team-today` rend, pour Awa, `visits_today_count = 2`, `first_visit_at` à 09:00 et `open_leads_count = 1`. Pour Ibrahima, il rend `current_absence.substitute.name = "Khady …"`.
- [ ] AC2 — Une visite à 23:30 heure de Dakar la veille (00:30 UTC aujourd'hui) n'est pas comptée aujourd'hui.
- [ ] AC3 — `filter[scheduled_from]=2026-11-10&filter[scheduled_to]=2026-11-10` rend, pour le prestataire, ses deux interventions du jour, et aucune intervention d'un autre prestataire.
- [ ] AC4 — Un bailleur à 14 échéances de loyer en novembre, dont 8 soldées, plus une caution, a `rent_month.received_count = 8` et `expected_count = 14`.
- [ ] AC5 — Un agent de l'agence reçoit 403 sur `team-today`.
- [ ] Ablation : retirer le fuseau de Dakar de `TeamTodayService` fait rougir AC2.

## Hors périmètre

- La date du prochain reversement au bailleur : aucune échéance de reversement n'est planifiée en base. TCK-2624 n'affiche le bloc que si l'API la rend un jour.
- Le délai de réponse par agent (famille 5, `contact-leads/response-stats`).
- Les écrans (TCK-2624, TCK-2625).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_

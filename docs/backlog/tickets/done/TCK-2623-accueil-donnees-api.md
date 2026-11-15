---
id: TCK-2623
title: "Accueil, côté API : l'équipe aujourd'hui pour l'admin, les interventions d'un jour pour le prestataire, les loyers du mois reçus sur attendus pour le bailleur"
status: done
phase: P1
family: back
estimate: M
wave: 87
created: 2026-11-10
updated: 2026-11-11
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

Implémenté le 2026-11-11 (agent back-coque), sur `feat/audit-ux-app-lot-1` (après 52a40d6ea).

**Ce qui est livré.**

- **`GET /api/agencies/{agency}/team-today`** : `Agency\TeamTodayController` et
  `Reporting\TeamTodayService`. La route est dans un fichier à part, `routes/api/agency-team-today.php`.
  - Réponse : `{data: {date, agents: [{user_id, name, avatar_url, visits_today_count, first_visit_at,
    open_leads_count, current_absence: {ends_at, substitute: {id, name}} | null}]}}`.
  - `date` est le jour de Dakar. Les instants sortent par `BaseResource::instantOnWire`.
  - Cinq requêtes de données (agents et comptes, photos, visites, demandes, absences), quel que soit
    l'effectif.
- **Porte.** Celle de `team-performance` : `viewReports` **et** `agency.standard_only` (403 pour une
  agence `individual`, qui n'a pas d'équipe). TCK-2624 n'appelle donc pas la route pour une agence
  individuelle.
- **Visites du jour.** Statut hors `cancelled` et `no_show` (la règle de l'accueil de l'agent), sur un
  bien de l'agence. Les bornes sont celles du jour **de Dakar**, converties dans le fuseau de
  l'application avant la requête.
- **Demandes ouvertes.** Un scope neuf, `PropertyContactLead::aTraiter()` : `channel = form` et
  `handled_at` nul, la définition du compteur du menu. Il est restreint à `agency_id` = l'agence et au
  destinataire.
- **Absence en cours.** `RoleDelegation::absences()->active()`, la règle du cycle de vie (TCK-456). Ce
  n'est ni le `current` de la liste (qui garde les absences à venir) ni `enVigueur()` (qui confère des
  droits). Le nom du remplaçant vient de `nameWithoutContact()`, comme `AgentAbsenceController`.
- **`MaintenanceRequest`** : `filter[scheduled_from]` et `filter[scheduled_to]` par
  `customQueryFilters()`.
  - Les valeurs sont des dates lues à Dakar, bornes incluses : `>=` début du jour, `<` début du
    lendemain.
  - Une valeur illisible ou une liste rend 422 (`DateBoundaryFilter::exiger`).
  - Le périmètre reste `visibleTo()`.
  - Une ligne est ajoutée à `docs/spatie-query-builder.md`.
- **`finance.rent_month {received_count, expected_count, received_amount}`** dans
  `DashboardOwnerService::summary`, repris tel quel par `OwnerMeMetrics` (`dashboard/me` →
  `metrics.rent_month`).
  - Seules les échéances `rent` comptent, ce qui exclut caution, restitution, charges et
    régularisation.
  - L'échéance doit tomber dans le mois de Dakar, sur un bail du bailleur quel que soit son statut.
  - `expected` compte toutes les échéances sauf `cancelled`. `received` compte les `paid`, et le montant
    est net de ce qui a été rendu.

**Ce que la re-mesure a montré de différent.**

1. **Africa/Dakar est à UTC+0** (`date('P')` → `+00:00`, et `config/app.php` est en UTC). L'exemple
   d'AC2, « 23:30 à Dakar la veille = 00:30 UTC », est faux. Retirer le fuseau dans la configuration
   réelle ne change rien, donc l'ablation demandée ne peut pas rougir AC2 tel qu'écrit. Deux tests la
   remplacent :
   - `test_ac2_les_bornes_du_jour_a_dakar` prend les bornes : la veille à 23:30 est exclue, 00:30 et
     23:59 sont comptées, le lendemain à 00:00 est exclu ;
   - `test_le_jour_est_celui_de_dakar_meme_si_le_serveur_n_y_est_pas` fait tourner le serveur à Tokyo.
     L'ablation du fuseau le rougit.
2. **`scheduled_at` était déjà dans `$queryFields`.** Les deux filtres ne vont pas dans
   `$requestFilterable`, qui en ferait des filtres exacts, mais dans `customQueryFilters()` (le patron
   de `Property::created_from` et d'`AgencyUpgradeRequest`).
3. **Budget de requêtes de l'accueil du bailleur.** `DashboardQueryBudgetTest` plafonne `owner` à 27
   requêtes, la valeur mesurée, et un relèvement est une décision du porteur. `rent_month` est donc lu
   **dans** la requête des baux existante, par trois sous-requêtes scalaires. Le plafond est inchangé
   et le test est vert.
4. **Une échéance `failed` reste attendue.** Le ticket dit « hors annulées » seulement : un échec de
   paiement repasse à `pending` ou à `paid` (`HasPaymentAttributes`). Cela diverge de
   `PortfolioMetrics::unpaidRate`, dont le facturé écarte aussi `failed`. À harmoniser si le porteur le
   veut.
5. **« Même définition que le compteur du menu »** : le menu compte les demandes **visibles** par
   l'appelant (`ContactLeadController::index`). Ici, on compte celles dont l'agent est le destinataire
   dans cette agence. Seul le prédicat « à traiter » est partagé (`aTraiter()`).

**Tests.** Trois fichiers neufs :
- `tests/Feature/Reporting/TeamTodayTest.php` : 9 tests ;
- `tests/Feature/Maintenance/MaintenanceScheduledRangeFilterTest.php` : 3 tests ;
- `tests/Feature/Dashboard/OwnerRentMonthTest.php` : 2 tests.

Vérification :
- 14 tests verts.
- 17 ablations, toutes rouges, restauration prouvée par `md5`.
- Les classes voisines sont vertes :
  - `TeamPerformanceTest`, `DashboardOwnerTest`, `DashboardKeyValuesTest` ;
  - `DashboardQueryBudgetTest`, `MaintenanceProviderListTest`, `AgentAbsenceTest` ;
  - les tests des demandes de contact et des listes d'interventions ;
  - les gardes de routes et de valeurs en liste, `ImpersonationReadSweepTest`.
- Écart avec le protocole TDD : `TeamTodayTest` a été écrit avant le code, mais lancé pour la première
  fois après. Chacune de ses règles est prouvée par ablation. Les deux autres fichiers ont été vus
  rouges d'abord.

**Reste.**
- `/sync-specs` après fusion : `features.md` § 25 (team-today, `rent_month`) et § 18 (filtre de
  créneau).
- Les écrans : TCK-2624 et TCK-2625.


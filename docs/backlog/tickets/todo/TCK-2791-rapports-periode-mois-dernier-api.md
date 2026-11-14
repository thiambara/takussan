---
id: TCK-2791
title: "Les trois tableaux de bord servent le mois dernier — `period=last_month` sur dashboard/agency, agent et owner"
status: todo
phase: P1
family: back
estimate: M
wave: 87
created: 2026-11-13
updated: 2026-11-13
depends_on: [TCK-2628]
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models: []
tags: [back, rapports, dashboard, periode, adr-0096]
---

## Objectif utilisateur

L'admin, l'agent et le bailleur relisent sur « Rapports » les chiffres du mois écoulé, à côté de ceux du mois en cours.

## Contrat de données

Relevé le 2026-11-13 : `GET /api/dashboard/agency`, `/agent` et `/owner` ne lisent que `months`, `scope` (agent) et `fields[summary]`. Le mois résumé est toujours celui de `now()` (`DashboardAgencyService`, `DashboardAgentService`, `DashboardOwnerService` : `now()->startOfMonth()` / `endOfMonth()`), et `period` le rend. La puce « Mois dernier » de la maquette de TCK-2628 n'a donc rien à lire : TCK-2628 la retire en attendant ce ticket (décision 4 a, validée le 2026-11-13).

## Contraintes strictes (métier)

- Un seul paramètre, une liste fermée : `period` ∈ {`current_month`, `last_month`}, défaut `current_month` ; toute autre valeur rend 422, jamais un mois silencieusement autre.
- Le mois se juge au calendrier de Dakar (Africa/Dakar), comme les autres lectures du mois.
- Les chiffres « du mois » (revenus, commissions, impayés du mois, baux signés, visites du mois…) suivent la période ; les états du jour (biens loués, occupation du jour, tâches ouvertes, impayés en cours) ne la suivent pas et le disent par leur clé, pour qu'aucun écran ne présente un état d'aujourd'hui comme celui du mois dernier.
- `period.start` / `period.end` de la réponse rendent la période servie.
- Mêmes gardes qu'aujourd'hui (`reports.view_agency`, portée de l'agent, vue bailleur ouverte à l'admin qui la détient) : la période ne change aucun droit.

## Delta à produire

- [x] FormRequests `ShowDashboardAgencyRequest`, `ShowDashboardAgentRequest`, `ShowDashboardOwnerRequest` (ou une règle commune) : `period` en liste fermée. — règle commune `PeriodeDuTableauDeBord::depuisLaRequete()`, appelée APRÈS les gardes des trois contrôleurs (le style de `dashboard.invalid_scope`).
- [x] Services : la borne du mois paramétrée, sans dupliquer le calcul ; les clés d'état du jour identifiées. — `summary(…, ?PeriodeDuTableauDeBord)` (défaut : mois en cours, accueil, alertes et KPI inchangés) ; `ETATS_DU_JOUR` par service, rendus dans `period.as_of_today`.
- [x] Tests : `DashboardPeriodTest` — mois dernier sur les trois endpoints (un loyer encaissé le mois dernier compte dans `last_month`, pas dans `current_month`), valeur inconnue en 422, garde inchangée, bornes de `period` en heure de Dakar le 1er du mois. — 10 tests, dont le 1er novembre à 00:00 heure de Dakar, le 31 octobre, et la portée « Agence » de l'agent ; Dakar prouvé aussi sous un fuseau d'application décalé (Asia/Tokyo), Dakar étant à UTC+0 comme l'application.
- [x] Front (TCK-2628 suivant) : la puce « Mois dernier » de « Rapports » rendue quand l'API la sert. — `ChoixDeLaPeriode` : puces « Ce mois · Mois dernier » au téléphone, « Ce mois ▾ » dans la tête au bureau, sur la vue d'ensemble seule.

## Critères d'acceptation

- [x] AC1 — `GET /api/dashboard/agency?period=last_month` le 13 novembre rend `period.start` = 1er octobre et `finance.revenue_month` = l'encaissé d'octobre. — `test_ac1_agency_last_month_serves_october_and_its_collected_rent` (et = le point d'octobre de la série) ; ablation « période ignorée » rouge.
- [x] AC2 — `?period=yesterday` rend 422 sur les trois endpoints. — `test_ac2_…` (aussi `period[]=last_month` et `LAST_MONTH`) ; ablation « tableau accepté » rouge.
- [x] AC3 — Un agent sans `reports.view_agency` qui demande `scope=agency&period=last_month` reçoit le même refus qu'aujourd'hui. — `test_ac3_the_period_opens_no_right` : 403, et 403 (pas 422) avec une période invalide, sur les trois endpoints ; ablation « période lue avant la garde » rouge.

## Hors périmètre

- Une période libre (du … au …) ou d'autres mois que le précédent.
- Les séries de 12 mois (`months`), déjà servies.

## Notes d'implémentation

- 2026-11-14 — Prémisse re-mesurée : aucun des trois contrôleurs ne lisait `period`.
- Contrat : `period = {key, start, end, as_of_today}` ; `as_of_today` liste les chemins qui restent l'état du jour (décision posée à team-lead, option a : les clés gardent leur nom). Les tuiles configurées (`kpis`) portent `as_of_today` ; seules `revenue_month` et `commission_month` suivent la période.
- Agent : `commissions_year` = cumul de l'année du mois servi jusqu'à sa fin (en janvier, l'année d'avant) ; inchangé sous le mois en cours.
- Bailleur : `rent_month` et `cashflow_month` suivent la période ; `expected_monthly` est un état du jour (le front retire « sur … attendus » sous « Mois dernier »).
- Front : la période de l'adresse passe par une liste fermée (`periodeTransmise`), jamais transmise telle quelle ; le mois en cours n'écrit rien (lectures d'avant à l'identique). Le « mois en cours » de la variation et des graphiques se lit de la réponse (`moisEnCoursDeLaReponse`), jamais de `period.start` : sous « Mois dernier », « Encaissé » compare octobre (clos) à septembre. La bascule « Moi / Agence » garde la période. « 12 mois » de la maquette non rendu (aucune lecture ne le sert).
- « Baux signés » sous « Mois dernier » en janvier : la série de 12 mois ne voit pas janvier de l'année servie, le cumul annuel n'est alors pas dit (plutôt qu'un faux).
- `as_of_today` gardé des deux côtés : chaque chemin existe dans la réponse des trois endpoints (`test_every_as_of_today_path_exists_in_the_response`) ; le front n'a aucune liste à lui, la marque « aujourd'hui » se lit de `as_of_today` (retirer un chemin n'efface que sa tuile, test `it.each`).
- Ablations : 11 côté API, 9 côté front, toutes rouges, fichiers restaurés au md5 (dont « chemin renommé » et « liste recopiée dans le front »).
- Après fusion : `/sync-specs` (features.md §25 ne connaît pas `period`).

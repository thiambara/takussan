---
id: TCK-2865
title: "Rapports, côté API : la période « 12 mois », le délai de réponse par agent, et les séries « Impayés » (agence) et « Attendu » (bailleur)"
status: done
phase: P1
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: []
blocks: [TCK-2867]
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models: []
tags: [back, rapports, tableau-de-bord, audit-ux, app]
---

## Objectif utilisateur

L'admin regarde son agence sur douze mois, compare la réactivité de son équipe, et suit ses impayés dans le temps ; le bailleur compare ce qu'il a encaissé à ce qu'il attendait.

## Contrat de données

Relevé le 2026-11-15 (`dev` 8c60f4c58) :

- `PeriodeDuTableauDeBord` : `period ∈ {current_month, last_month}`, liste fermée (toute autre valeur → 422 `dashboard.invalid_period`) — **pas de « 12 mois »** (TCK-2628 : « aucune lecture ne sert »).
- `TeamPerformanceService::forPeriod` : `leads_handled` est servi (« Demandes traitées » ne manque qu'à l'écran) ; **pas de délai de réponse par agent** — `Directory/ResponseTimes` le calcule pour l'annuaire public (médiane, fenêtre 90 j).
- `?include=timeseries` (agence, agent, bailleur) : 12 mois d'encaissé et d'occupation — **ni série « Impayés » (agence), ni série « Attendu » (bailleur)**.
- Le sélecteur « Agence ▾ » de la maquette choisit l'**espace** (l'agence), que la coque choisit déjà : rien à servir ici (TCK-2867).

## Contraintes strictes (métier)

- **12 mois** : `period=last_12_months` ajouté à la liste fermée de `PeriodeDuTableauDeBord` (les 12 mois glissants terminés au mois en cours) ; toutes les lectures qui acceptent `period` le servent ou rendent 422 explicitement (pas de mois silencieusement substitué). `enTete()` le décrit.
- **Délai de réponse** : chaque ligne de `team-performance` gagne `median_response_minutes` (même définition que `ResponseTimes`, sans la recopier ; `null` sous le seuil de conversations) ; la réponse gagne `totals` (`agents`, et la somme ou médiane de chaque colonne).
- **Séries** : `timeseries.overdue` (montant impayé en fin de mois, agence, même règle *Impayé* que `CollectedPayments::leaseOwed`) ; `timeseries.expected` (loyers attendus du mois, bailleur).

## Delta à produire

- [ ] Période `last_12_months`.
- [ ] `median_response_minutes` + `totals` dans `team-performance`.
- [ ] Séries `overdue` et `expected`.
- [ ] Tests `DashboardPeriodTwelveMonthsTest`, `TeamPerformanceResponseTimeTest`, `TimeseriesOverdueExpectedTest`.

## Critères d'acceptation

- [ ] AC1 — `GET /api/dashboard/agency?period=last_12_months` → 200, `period` couvre décembre 2025 → novembre 2026 ; `period=foo` → 422 (régression gardée).
- [ ] AC2 — `team-performance` : agent ayant répondu en médiane en 42 min → `median_response_minutes = 42` ; moins de conversations que le seuil → `null` ; `totals.agents = 5`.
- [ ] AC3 — `include=timeseries` de l'agence : `overdue` a un point par mois ; un loyer de 300 000 F impayé fin octobre compte dans le point d'octobre.
- [ ] AC4 — Bailleur : `timeseries.expected` du mois = la somme des loyers échus du mois de ses baux.
- [ ] AC5 — Ablation : compter un loyer soldé dans `overdue` fait rougir AC3.

## Hors périmètre

- Impayés en PDF, alertes, exports : TCK-2866. Les écrans : TCK-2867.

## Notes d'implémentation

Livré le 2026-11-15 (arbre `takussan-manques`).

- **Période `last_12_months`** (`PeriodeDuTableauDeBord`) : de décembre 2025 à novembre 2026 un jour de novembre.
  `enTete()` gagne `months` (la liste `AAAA-MM` des mois couverts, un seul sous les deux autres périodes). Les
  tableaux de bord agence, agent et bailleur la servent : les montants « du mois » valent pour la période ENTIÈRE
  (`somme()` sur les mois couverts : encaissé, reversé, commission, loyers du mois du bailleur) ; la courte durée est
  UNE mesure sur la période (`PortfolioMetrics::shortStayOccupancyOver`, nuitées ÷ capacité, jamais une moyenne de
  taux) ; `commissions_year` de l'agent reste le cumul de l'année EN COURS (dérivé de la fin de la période, plus de
  son début). `team-performance` garde `period=Y-m` : `last_12_months` y rend 422 (test), jamais un mois substitué.
- **Délai de réponse — écart à la prémisse** : le ticket renvoyait à `Directory/ResponseTimes` (fils de messagerie de
  prospect) ; la session a demandé de réutiliser le calcul de TCK-2871 (`ContactLeadResponseStatsService`, demandes du
  formulaire, `first_responded_at`), que l'onglet Équipe affiche déjà (`contact-leads/response-stats`). C'est celui-ci :
  `minutesForTeam()` partage la requête groupée par répondant avec `compute()` (`byResponder()`), sur les demandes
  déposées DANS le mois de la ligne (comme les autres colonnes), seuil `TEAM_MIN_SAMPLE = 5` (celui de l'annuaire).
  `totals` : `agents`, la somme de chaque colonne de compte ou de montant, et `median_response_minutes` de l'équipe =
  une médiane sur toutes les demandes de l'agence, jamais la médiane des médianes.
- **`timeseries.overdue`** (agence, `PortfolioMetrics::overdueByMonth`, une requête) : une échéance compte pour le mois M
  si elle était échue à la fin de M (avant le 1er du mois suivant ; le mois en cours : avant aujourd'hui) et non soldée
  à cette date — encore due aujourd'hui (au reste dû), ou `paid | refunded` avec `paid_at` postérieur (au montant). Jamais
  une restitution de caution. Le point du mois en cours vaut `finance.overdue_amount` (testé). **Limite** : un versement
  partiel n'est pas daté ; une échéance encore partiellement payée compte à son reste dû d'aujourd'hui dans chaque mois.
- **`timeseries.expected`** (bailleur, `PortfolioMetrics::expectedRentByMonth`) : Σ des échéances `rent` hors annulées
  échéant dans le mois — la règle extraite en `CollectedPayments::rentExpected()`, que `loyersDuMois()` lit aussi.
- **Budget de requêtes** (`DashboardQueryBudgetTest`) relevé délibérément : `owner` 27 → 28, `agency` 30 → 31 (une
  requête de série de plus chacun, constante en mois). `TeamPerformanceLeadsHandledTest` ne compte plus que la requête
  des demandes traitées (le délai lit aussi `property_contact_leads`).
- Front : types déclarés (`TeamPerformanceRow.median_response_minutes`, `TeamPerformanceTotals`,
  `DashboardAgencyTimeseries.overdue`) ; `PERIODES_DES_RAPPORTS` non touché (TCK-2867).
- Ablations (une à une, restaurées par `cp`, md5 vérifié) : statut courant seul ou loyer soldé compté → AC3 rouge ; douze
  mois = un mois, somme → premier mois, année de l'agent depuis le début, borne du bailleur → AC1 rouge ; seuil à 1,
  fenêtre non bornée au mois → AC2 rouge ; annulées comptées → AC4 rouge. Sous douze mois, reversé = premier mois ou courte durée =
  moyenne des taux mensuels → rouge (`test_owner_twelve_months_sum_the_payouts_and_pool_the_short_stay_occupancy`).
- Message 422 `errors.dashboard.invalid_period` (fr/en/wo) : nomme désormais les trois valeurs.

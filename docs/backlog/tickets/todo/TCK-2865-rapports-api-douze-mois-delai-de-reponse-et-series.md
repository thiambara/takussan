---
id: TCK-2865
title: "Rapports, côté API : la période « 12 mois », le délai de réponse par agent, et les séries « Impayés » (agence) et « Attendu » (bailleur)"
status: todo
phase: P1
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
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

_(à remplir par implementing-specs)_

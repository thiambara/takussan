---
id: TCK-032
title: Reporting & tableaux de bord
status: todo
phase: P1
family: applicatif
estimate: L
created: 2026-04-15
updated: 2026-04-15
depends_on: [TCK-034, TCK-027, TCK-028]
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
  models:
    - docs/models-spec.md#2-agency
    - docs/models-spec.md#3-property
    - docs/models-spec.md#14-lease-
    - docs/models-spec.md#25-invoice-
tags: [back, front, dashboard, reporting, charts, export]
---

## Contexte

Les dashboards sont essentiels pour chaque acteur. Ce ticket est transversal et agrège les données de biens, baux, paiements et clients pour fournir des vues synthétiques par rôle.

## Objectif

Implémenter les tableaux de bord par rôle (agence, bailleur, agent, locataire) avec indicateurs clés, et préparer les exports.

## Delta à produire

### P1

- [ ] Endpoint `GET /api/dashboard/agency` — stats agence : nombre de biens, vues totales, revenus mensuels, impayés
- [ ] Endpoint `GET /api/dashboard/owner` — stats bailleur : portefeuille, cashflow mensuel, taux d'occupation
- [ ] Endpoint `GET /api/dashboard/agent` — stats agent : pipeline prospects, commissions, tâches en cours
- [ ] Endpoint `GET /api/dashboard/tenant` — stats locataire : prochaines échéances, documents récents
- [ ] Pages Next.js : 4 dashboards distincts selon le rôle de l'utilisateur connecté
- [ ] Tests : `DashboardAgencyTest`, `DashboardOwnerTest`, `DashboardAgentTest`, `DashboardTenantTest`

### P2

- [ ] Export CSV / Excel (paiements, baux, clients) : `GET /api/export/{entity}?format=csv`
- [ ] Export PDF (quittances, factures, rapports) : `GET /api/export/{entity}?format=pdf`
- [ ] Graphiques temporels (revenus mensuels, taux d'occupation sur 12 mois)

### P3

- [ ] KPI personnalisables par agence
- [ ] Alertes sur seuils (taux d'impayés > X%, vacance > Y jours)

## Critères d'acceptation

- [ ] Chaque rôle voit un dashboard adapté avec des indicateurs pertinents
- [ ] Les chiffres affichés sont cohérents avec les données réelles
- [ ] Les exports CSV contiennent toutes les colonnes attendues
- [ ] Les graphiques temporels affichent les données sur la période sélectionnée

## Hors périmètre

- Export comptable FEC (→ P3 futur)
- KPI personnalisables (→ P3 futur)

## Notes d'implémentation

_(à remplir par implementing-specs)_

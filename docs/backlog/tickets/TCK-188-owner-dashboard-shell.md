---
id: TCK-188
title: Dashboard owner — widgets et navigation
status: todo
phase: P1
family: front
estimate: M
created: 2026-05-06
updated: 2026-05-06
depends_on: [TCK-032, TCK-130]
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#18-maintenance--interventions
    - docs/features.md#15-transactions--paiements
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#14-lease-
    - docs/models-spec.md#21-maintenancerequest-
    - docs/models-spec.md#28-payout-
tags: [front, owner, dashboard, navigation, smoke-test-2026-05-06]
---

## Objectif utilisateur

Un propriétaire doit ouvrir son espace et voir immédiatement les indicateurs et raccourcis nécessaires à la gestion de son portefeuille.

## Contrat de données

Le dashboard owner agrège portefeuille, cashflow, occupation, réservations en attente, maintenance et reversements. La sidebar dépend du rôle/profil actif et doit exposer toutes les routes owner disponibles.

## Direction UX / Artistique

Dashboard opérationnel compact : KPI haut de page, listes courtes actionnables, état vide clair, navigation stable. Priorité à la lecture rapide plutôt qu'à une composition marketing.

## Contraintes strictes (métier)

- Les métriques owner sont strictement scopées au portefeuille du profil actif.
- Le lien `Maintenance` doit être visible pour un owner si la route est autorisée.
- Aucun lien d'administration globale ou de modération admin ne doit apparaître.
- Les widgets ne doivent pas afficher de données fictives en cas d'absence de réponse API.

## Delta à produire

- [ ] Compléter la sidebar owner avec `Maintenance` dans l'ordre métier.
- [ ] Clarifier l'entrée owner : `/app` role-aware ou redirection/raccourci vers `/app/overview/owner`.
- [ ] Dashboard owner : détail portefeuille par type/statut.
- [ ] Dashboard owner : cashflow avec revenus mensuels, cumul annuel, impayés et prochains payouts si disponibles.
- [ ] Dashboard owner : liste courte des réservations en attente.
- [ ] Dashboard owner : bloc maintenance/devis à approuver.
- [ ] État vide owner sans bien avec CTA adapté.
- [ ] Tests frontend de navigation et rendu widgets selon rôle.

## Critères d'acceptation

- [ ] La sidebar owner contient `Maintenance`.
- [ ] La sidebar owner ne contient pas `Administration`, `Modération` ou action agent non autorisée.
- [ ] `/app/overview/owner` affiche portefeuille, cashflow, occupation, demandes en attente et maintenance.
- [ ] Un owner sans bien voit un état vide avec CTA adapté.
- [ ] Les prochains payouts sont visibles si l'API retourne des reversements.
- [ ] Les données affichées respectent le scope owner.

## Hors périmètre

- Création de nouvelles métriques backend si les agrégats existent déjà.
- Graphiques avancés P3.
- Refonte complète du shell dashboard.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_

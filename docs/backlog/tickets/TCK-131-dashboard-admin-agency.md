---
id: TCK-131
title: "Dashboard /admin agence — câblage indicateurs & vue d'ensemble"
status: review
phase: P1
family: front
estimate: M
created: 2026-05-02
updated: 2026-05-02
depends_on: [TCK-032]
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#112-agence--équipe
  models:
    - docs/models-spec.md#2-agency
    - docs/models-spec.md#3-property
    - docs/models-spec.md#14-lease-
    - docs/models-spec.md#15-leasepayment-
    - docs/models-spec.md#28-payout-
tags: [front, dashboard, admin, agency, p1]
---

## Objectif utilisateur

Un agency_admin ouvre `/admin` et voit en un coup d'œil la santé opérationnelle et financière de son agence (biens, vues, revenus, impayés, occupation) sans page « En cours de développement ».

## Contrat de données

Endpoint adaptatif fourni par TCK-032, scopé à l'agence courante (`GET /api/dashboard/me` ou `GET /api/agencies/{id}/dashboard` — selon ce que TCK-032 expose). Le frontend ne déduit pas l'agence côté client, il consomme la réponse.

Conventions Spatie obligatoires : `fields[...]`, `include=`, jamais de filtrage côté client.

## Direction UX / Artistique

- Tonalité **back-office sérieux**, dense en information ; pas de hero.
- Bandeau supérieur : 4-6 KPIs principaux (biens actifs, baux actifs, taux d'occupation, revenus du mois, impayés, vues du mois) — cartes compactes.
- Section secondaire : liste courte des dernières activités (réservations, contrats à signer, signalements en attente) avec lien vers la page détaillée.
- Section finance condensée : revenus 12 derniers mois (placeholder visuel ok, vrai graphique en P2 dédié).
- Cohérent avec la sidebar admin actuelle et le pattern visuel des autres pages admin (`/admin/team`, `/admin/agency`).
- Aucun StubPlaceholder.

## Contraintes strictes (métier)

- Visible uniquement aux rôles `agency_admin` et `super_admin` rattachés à une agence ; `super_admin` sans agence → `NoAgencyState` (TCK-115).
- Ne jamais cumuler les KPIs de plusieurs agences (chaque admin voit la sienne).
- Les valeurs sensibles (revenus, impayés) sont conditionnées par les permissions (`view_agency_reports` ou équivalent).
- Aucun chiffre fictif : afficher `—` puis la vraie donnée.

## Delta à produire

- [ ] Page UI: `src/app/(dashboard)/admin/page.tsx` — retirer `<StubPlaceholder>`
- [ ] Composants `AgencyKpiTile`, `AgencyActivityFeed`, `AgencyRevenueSnapshot`
- [ ] Hook/query React Query consommant l'endpoint dashboard agence
- [ ] Skeletons et états vides
- [ ] Tests UI (rendu agency_admin, super_admin sans agence, permission insuffisante)

## Critères d'acceptation

- [ ] La page n'affiche plus `<StubPlaceholder>`
- [ ] Les 4-6 KPIs agence sont peuplés depuis l'API
- [ ] Un super_admin sans `agency_id` voit `NoAgencyState`
- [ ] Un utilisateur sans permission de lecture rapport voit un état dégradé (KPIs masqués + message)
- [ ] Aucune donnée d'autre agence n'apparaît dans la réponse

## Hors périmètre

- Implémentation de l'endpoint dashboard (TCK-032)
- Graphiques temporels avancés (P2)
- Export CSV/PDF (P2)
- KPIs personnalisables par agence (P3)

## Notes d'implémentation

- **Endpoint consommé** : `GET /api/dashboard/agency?include=timeseries` exclusivement (TCK-032 controller `DashboardAgencyController`). Le scope agence est résolu côté serveur (`user->agency_id`) ; le frontend ne passe **jamais** `agency_id` — c'est ce qui garantit l'AC « aucune donnée d'autre agence ».
- **Mapping AC ↔ état UI** :
  - `super_admin` sans agence → `NoAgencyState` (TCK-115) avant tout fetch.
  - 403 / 404 du backend → `AgencyDegradedState` (KPIs masqués + message, pas de zéros trompeurs). Pas de permission Spatie côté frontend pour l'instant ; on s'aligne sur le verdict du contrôleur, qui restera la source de vérité quand `view_agency_reports` sera ajouté.
- **Choix des 6 KPIs** : `properties.total`, `leases.active`, `occupancy.rate_percent`, `finance.revenue_month`, `finance.overdue_amount`, `finance.unpaid_rate_percent`. Les pourcentages renvoyés par l'API sont en points (0..100) ; on les divise par 100 avant `formatPercent` pour rester dans la convention « fraction → %  ».
- **Activité récente** : pas d'endpoint dédié → on agrège les compteurs déjà exposés (`bookings.pending`, `maintenance.open`, `customers_count`, `members_count`) avec un lien direct vers la page détaillée. Une vraie liste chronologique est repoussée à un ticket dédié.
- **Revenu 12 mois** : utilisé `BarChart` existant (`@/components/charts/BarChart`) avec les valeurs de `timeseries.revenue` ; libellés mois courts en FR. Pas de seconde série (occupation) — vue P2 en ticket dédié.
- **Fichiers créés** : `src/lib/queries/dashboard-agency.ts`, `src/components/dashboard/admin/{AgencyKpiTile,AgencyKpis,AgencyActivityFeed,AgencyRevenueSnapshot,AgencyDegradedState}.tsx`, plus 3 fichiers de tests Vitest dans `__tests__/`.
- **Fichier réécrit** : `src/app/(dashboard)/admin/page.tsx` — `StubPlaceholder` retiré, branche `NoAgencyState` (TCK-115) conservée intacte.
- **Tests** : 6 cas Vitest (3 sur `AgencyKpis`, 1 sur `AgencyActivityFeed`, 2 sur `AgencyRevenueSnapshot`). La page serveur n'est pas unit-testée (cohérent avec `/app/page.tsx` et `/app/overview/agent/page.tsx`).
- **Hors périmètre confirmé** : pas de skeletons `loading.tsx` (page Server Component synchrone, pattern aligné sur les autres dashboards) ; pas d'endpoint backend (`/api/dashboard/agency` était déjà fourni par TCK-032).

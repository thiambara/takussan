---
id: TCK-227
title: "Super-admin — Reporting plateforme cross-tenant (croissance, MRR, cohortes)"
status: done
phase: P2
family: applicatif
estimate: L
wave: 24
created: 2026-05-07
updated: 2026-05-07
depends_on: [TCK-222]
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#2-agency
    - docs/models-spec.md#1-user
    - docs/models-spec.md#43-plan-
    - docs/models-spec.md#44-agencysubscription-
tags: [back, front, super_admin, reporting, p2]
---

## Contexte

La spec étend §2.5 avec un reporting plateforme cross-tenant strictement super-admin. Les KPIs livrés par TCK-145 (`SystemMetricsGrid`) sont des compteurs ponctuels — manquent l'évolution temporelle, le MRR/ARR et les cohortes. Sans ces vues, impossible de piloter la croissance, anticiper le churn ou évaluer une release.

## Objectif utilisateur

Un super-admin ouvre `/super-admin/reports` et choisit parmi plusieurs vues : croissance (agences / users / listings sur 12 mois), revenu plateforme (MRR / ARR à partir des `AgencySubscription`), cohortes de rétention agences par mois d'inscription, funnel listing → réservation → bail signé.

## Contrat de données

Endpoints à exposer :

- `GET /api/admin/reports/growth?metric=agencies|users|listings&period=12m|6m|3m&granularity=day|week|month` — série temporelle agrégée
- `GET /api/admin/reports/revenue?period=12m&granularity=month` — MRR / ARR / nb souscriptions actives par bucket
- `GET /api/admin/reports/cohorts?cohort_basis=signup_month&depth=12` — matrice de rétention agences (% encore actives à M+1, M+2, …)
- `GET /api/admin/reports/funnel?period=30d` — `{ listings_published, bookings_requested, bookings_confirmed, leases_signed }`
- `GET /api/admin/reports/{report}/export?format=csv|xlsx` — export téléchargement signé du même jeu de données

Tous les endpoints retournent du JSON tabulaire normalisé `{ rows: [...], totals?: {...}, period: {...} }`.

## Direction UX / Artistique

Page `/super-admin/reports` avec navigation latérale entre les 4 vues. Chaque vue : sélecteur de période / granularité, graphique principal (line / bar / heatmap selon la vue), table des données dessous (avec lien export). Bandeau d'information rappelant le caractère lecture seule super-admin et la fenêtre d'agrégation.

## Contraintes strictes (métier)

- Endpoints super-admin-only.
- Toutes les agrégations sont **calculées côté serveur** via SQL — pas de boucle PHP sur des collections paginées.
- Les requêtes coûteuses (cohortes, MRR rétroactif) sont **cacheables** 10 minutes via le runtime cache (`Cache::remember`). Le ticket câble explicitement le cache et expose le timestamp `generated_at` dans la réponse.
- L'export CSV / XLSX passe par un job background si la matrice dépasse 10 000 lignes (lien signé envoyé par email, statut suivi via `data_exports` réutilisé si pertinent ou table dédiée `report_exports`).
- Toujours `fields[...]`, `filter[...]` admis quand applicable.
- Activity log sur les exports (`super_admin_report_exported`) — la simple lecture n'est pas tracée (volume).

## Delta à produire

- [ ] Service `App\Services\Reporting\PlatformReportingService` (4 méthodes : `growth`, `revenue`, `cohorts`, `funnel`)
- [ ] Vues SQL ou requêtes paramétrées optimisées (index dédiés si nécessaire — `agencies(created_at)`, `users(created_at)`, `properties(created_at, status)`, `bookings(status, created_at)`, `leases(status, signed_at)`, `agency_subscriptions(status, current_period_start)`)
- [ ] Cache 10min via `Cache::remember`
- [ ] Controller `Admin\ReportingController` (5 actions : 4 lectures + export)
- [ ] FormRequests (validation période, granularité, format)
- [ ] Resources (normalisation `{ rows, totals, period, generated_at }`)
- [ ] Job `Reporting\GenerateReportExport` pour les exports volumineux (> 10k lignes)
- [ ] Notification email avec lien signé (réutilise pattern TCK-225)
- [ ] Activity log événement `super_admin_report_exported`
- [ ] Frontend page `/super-admin/reports` (4 sous-pages ou onglets)
- [ ] Composants : `GrowthChart`, `RevenueChart`, `CohortHeatmap`, `FunnelChart`, `ReportExportButton`
- [ ] Tests backend : exactitude des agrégations sur jeu de données fixé (snapshot), cache invalidation, 403 hors super-admin, export borné
- [ ] Tests UI : navigation entre vues, export

## Critères d'acceptation

- [ ] Les 4 endpoints retournent en < 500ms en local sur un dataset de 1k agences / 10k users (test de charge léger)
- [ ] Le MRR est calculé en sommant `AgencySubscription` actives × `Plan.monthly_price_xof + override` au mois donné — assert exact en test
- [ ] Une cohorte affiche 100% au M0, puis dégradation cohérente (test sur dataset synthétique)
- [ ] Un agency_admin reçoit 403 sur tous les endpoints
- [ ] Le cache est invalidé quand une nouvelle `Agency` est créée (touch tag)
- [ ] L'export > 10k lignes passe en async et notifie par email
- [ ] Chaque export produit une entrée d'audit

## Hors périmètre

- Reporting opérationnel agency-side (déjà partiellement couvert par TCK-131 / TCK-205)
- Drill-down multi-niveaux interactif — out of scope, vues plates suffisent
- Analyse prédictive / IA — out of scope
- Custom report builder — out of scope (P3)

## Notes d'implémentation

- Cache invalidation : version-based via clé `reporting:cache_version` bumpée à chaque `Agency::created` (cf. `AppServiceProvider::boot`). Toutes les clés reporting embarquent `…:v{N}` dans leur nom — un bump rend les anciennes cold-miss sans avoir à enumérer les clés.
- Endpoints non audités en lecture (volume) ; seul l'export logge `super_admin_report_exported`.
- Les exports >10 000 lignes basculent en async via `Reporting\GenerateReportExport`. Sous le seuil, le payload est retourné en ligne (statut `ready`).
- Cohort sizing utilise `withTrashed()` pour ne pas exclure les agences soft-deletées du dénominateur.
- Charts sans dépendance externe (HTML/CSS + Tailwind) — assez expressifs pour la décision P2 sans introduire un lib chart (out of scope).

---
id: TCK-226
title: "Super-admin — Healthcheck plateforme & supervision des jobs"
status: done
phase: P2
family: applicatif
estimate: M
created: 2026-05-07
updated: 2026-05-07
depends_on: [TCK-145]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#30-setting
tags: [back, front, super_admin, observability, p2]
---

## Contexte

La spec étend §2.9 avec "Healthcheck plateforme et supervision des jobs en arrière-plan". La page `/super-admin/system` est un stub. En cas d'incident (queue bloquée, jobs en échec, base saturée), le super-admin n'a actuellement aucune visibilité sans accès SSH / Horizon — délai d'investigation inacceptable.

## Objectif utilisateur

Un super-admin ouvre `/super-admin/system/health` et voit en une page : santé infrastructurelle (DB, cache, storage, mail driver, sms driver), métriques de queue (jobs en attente, en cours, échoués 24h), et liste paginée des `failed_jobs` avec actions "Rejouer" et "Supprimer".

## Contrat de données

Endpoints à exposer :

- `GET /api/admin/health` — synthèse `{ db: {status, latency_ms}, cache, storage, mail, sms, queue: {pending, processing, failed_24h}, scheduler: {last_run_at} }`
- `GET /api/admin/jobs/failed?per_page=...&filter[queue]=...` — liste paginée des `failed_jobs`
- `POST /api/admin/jobs/failed/{id}/retry` — rejoue un job échoué
- `POST /api/admin/jobs/failed/retry-all` — bulk retry (refus 409 si > 500 entrées en file ; sinon dispatch un job qui itère)
- `DELETE /api/admin/jobs/failed/{id}` — supprime
- `GET /api/admin/scheduler` — liste des tâches planifiées (Laravel scheduler) avec `last_run_at`, `next_due_at`, durée moyenne

## Direction UX / Artistique

Page `/super-admin/system/health` : strip de KPIs en haut (DB / Cache / Storage / Mail / SMS — pastille verte/ambre/rouge), métriques queue en cartes, table `failed_jobs` paginée avec actions par ligne et action bulk en haut. Auto-refresh toutes les 30s configurable. Page `/super-admin/system/scheduler` séparée pour les tâches planifiées.

## Contraintes strictes (métier)

- Endpoints super-admin-only.
- Le healthcheck est **synthétique** : un ping minimal par dépendance (DB `SELECT 1`, cache `set/get`, storage `put/get` sur fichier éphémère, mail driver lookup config, SMS driver lookup integration TCK-217). Aucune dépendance ne doit faire échouer la page entière — chaque section a son propre statut isolé.
- Le bulk retry est **borné** (max 500 jobs par invocation pour éviter de saturer la queue) et journalisé.
- Activity log obligatoire (`super_admin_job_retried|deleted|bulk_retried`).
- Aucune fuite de payload sensible : les arguments des jobs `failed` sont tronqués à 1KB dans la liste, le payload complet n'est exposé qu'à la demande explicite (`GET /api/admin/jobs/failed/{id}` détail) et toujours avec un avertissement.
- Toujours utiliser `fields[...]`, `filter[...]`, `include=`.

## Delta à produire

- [ ] Service `App\Services\Admin\HealthcheckService` (un check par dépendance, isolation des erreurs)
- [ ] Service `App\Services\Admin\FailedJobService` (lecture paginée, retry, delete, bulk retry borné)
- [ ] Service `App\Services\Admin\ScheduledTaskInspector` (lecture des `Schedule::*` + état persistant)
- [ ] Migration : table `scheduled_task_runs` (capture `last_run_at`, `duration_ms`, `status`) — observée via un événement Laravel `Illuminate\Console\Events\ScheduledTaskFinished`
- [ ] Listener qui persiste les runs dans `scheduled_task_runs`
- [ ] Controllers `Admin\HealthcheckController`, `Admin\FailedJobController`, `Admin\SchedulerController`
- [ ] Routes `routes/api/admin.php`
- [ ] Activity log événements
- [ ] Frontend pages `/super-admin/system/health` et `/super-admin/system/scheduler`
- [ ] Composants : `HealthStrip`, `QueueMetricsCards`, `FailedJobsTable`, `ScheduledTaskTable`
- [ ] Tests backend : isolation des checks (un check failed ne fait pas crasher la page), bulk retry plafonné, payload tronqué dans la liste, 403 hors super-admin
- [ ] Tests UI : rendu strip, retry job, refresh

## Critères d'acceptation

- [ ] Si le driver SMS est en panne, le statut DB reste vert sur la page (isolation des checks)
- [ ] `POST /retry-all` avec > 500 entrées retourne 409 sans déclencher le bulk
- [ ] La liste `failed_jobs` tronque le payload `args` à 1KB
- [ ] Un agency_admin reçoit 403 sur tous les endpoints
- [ ] Chaque retry produit une entrée d'audit
- [ ] `GET /api/admin/scheduler` retourne la liste des tâches planifiées avec `last_run_at` peuplé après au moins un run

## Hors périmètre

- Métriques temps-réel (Prometheus / push) — out of scope, snapshot pull suffit
- Tracing distribué — out of scope
- Alerting automatique sur les échecs (déjà couvert par TCK-220 — alertes sur événements applicatifs)
- Horizon (UI Redis-only) — pas de dépendance Redis imposée ; le ticket reste agnostique de la queue driver

## Notes d'implémentation

Le détail complet d'un job échoué reste séparé de la liste : la liste tronque payload/exception à 1KB, et les runs scheduler sont capturés via `ScheduledTaskFinished` dans `scheduled_task_runs`.

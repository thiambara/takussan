---
id: TCK-218
title: "Super-admin — Mode maintenance programmé"
status: review
phase: P3
family: applicatif
estimate: S
created: 2026-05-07
updated: 2026-05-07
depends_on: [TCK-216]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#30-setting
tags: [back, front, super_admin, p3]
---

## Contexte

`features.md` §2.9 P3 prévoit le "Mode maintenance programmé". Aujourd'hui Laravel propose `php artisan down` mais il faut un accès terminal — un super-admin ne peut pas planifier une fenêtre de maintenance ni afficher un bandeau d'avertissement aux utilisateurs avant l'interruption.

## Objectif utilisateur

Un super-admin programme une fenêtre de maintenance depuis `/super-admin/system/maintenance` — fenêtre datée (début / fin), message multilingue, sévérité (info / planifiée / interruption). Un bandeau s'affiche aux utilisateurs avant la fenêtre ; pendant la fenêtre, l'application bascule en lecture seule ou hors-ligne selon le mode.

## Contrat de données

Endpoints à exposer :

- `GET /api/admin/maintenance` — état courant + fenêtre programmée
- `POST /api/admin/maintenance` — programmer `{ starts_at, ends_at, mode: 'banner'|'read_only'|'down', messages: {fr, en, wo}, severity }`
- `DELETE /api/admin/maintenance` — annuler la fenêtre programmée
- `GET /api/maintenance/status` — endpoint public lecture seule consommé par tous les fronts pour afficher le bandeau

Persistance via `Setting` ou table dédiée `maintenance_windows`. Décision lors de l'implémentation, mais le contrat API est figé.

## Direction UX / Artistique

Page simple : section "État courant" + section "Programmer une fenêtre" (date pickers, sélecteur de mode, éditeur multilingue). Bandeau live de prévisualisation. Sur l'app principale, bandeau permanent jaune (info/planifiée) ou rouge (interruption) avec compte à rebours. Mode `down` : page de maintenance dédiée multilingue, redirect explicite (sauf super-admin qui garde l'accès).

## Contraintes strictes (métier)

- Endpoints super-admin-only.
- Le mode `down` autorise toujours les routes `/api/admin/*` et la console super-admin (le super-admin garde le contrôle).
- Le mode `read_only` refuse 503 toutes les requêtes mutatives (POST/PUT/PATCH/DELETE) sauf `/api/admin/*`.
- Le bandeau s'affiche **avant** la fenêtre (T - 30 min par défaut, configurable) et pendant.
- L'endpoint `GET /api/maintenance/status` est cacheable 60 secondes (réduction de charge).
- Activity log obligatoire : `super_admin_maintenance_scheduled|cancelled`.
- La fenêtre doit avoir `ends_at > starts_at` et `starts_at >= now()` à la création.

## Delta à produire

- [x] Migration / store : décision lors de l'implémentation (table dédiée préférable)
- [x] Middleware `App\Http\Middleware\MaintenanceMode` (vérifie l'état, retourne 503 si `read_only` mutatif ou `down`)
- [x] Service `App\Services\Admin\MaintenanceService`
- [x] Controller `Admin\MaintenanceController`
- [x] Endpoint public `GET /api/maintenance/status`
- [x] Activity log événements
- [x] Frontend page `/super-admin/system/maintenance`
- [x] Composant global `MaintenanceBanner` monté côté `(public)` et `(dashboard)` (consomme `/api/maintenance/status`)
- [x] Page de maintenance multilingue pour le mode `down`
- [x] Tests backend : modes `banner`, `read_only`, `down` ; super-admin garde l'accès en `down` ; validation des dates
- [x] Tests UI : programmation, annulation, bandeau visible

## Critères d'acceptation

- [x] Mode `down` : un user authentifié non super-admin reçoit 503 sur les routes API et la page de maintenance côté front
- [x] Mode `down` : un super-admin continue d'accéder à `/super-admin/*` et `/api/admin/*`
- [x] Mode `read_only` : `POST /api/properties` retourne 503 ; `GET /api/properties` retourne 200
- [x] Le bandeau apparaît T - 30min avant la fenêtre programmée
- [x] Une fenêtre avec `starts_at < now()` est refusée 422
- [x] Un agency_admin reçoit 403 sur `POST /api/admin/maintenance`
- [x] La fenêtre annulée est enregistrée dans l'audit

## Hors périmètre

- Maintenance par sous-domaine ou par feature (utiliser TCK-219 feature flags)
- Notification push proactive aux utilisateurs avant la fenêtre — out of scope
- Auto-rollback en cas d'échec de déploiement — out of scope

## Notes d'implémentation

- Store dédié `maintenance_windows` retenu pour historiser les fenêtres et les annulations plutôt que de surcharger `settings`.
- Le middleware API exclut toujours `/api/admin/*` et `/api/maintenance/status`, afin que le super-admin garde le contrôle pendant un mode `down`.
- Côté front, le composant global est monté au root layout ; il redirige les non-super-admin vers `/maintenance` pendant un `down`.

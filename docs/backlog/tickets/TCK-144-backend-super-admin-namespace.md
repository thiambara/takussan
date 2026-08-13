---
id: TCK-144
title: "Backend — Namespace super_admin dédié `/api/admin/...`"
status: done
phase: P1
family: technique
estimate: L
wave: 16
created: 2026-05-02
updated: 2026-05-02
depends_on: [TCK-142]
blocks: [TCK-145]
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
    - docs/features.md#29-administration--configuration
    - docs/features.md#26-audit--traçabilité
  models:
    - docs/models-spec.md#1-user
    - docs/models-spec.md#spatielaravel-permission
tags: [back, super_admin, refactor, technique, p1]
---

## Contexte

Avec la cutover des profils polymorphes (TCK-138 → TCK-142), `super_admin` reste le seul rôle global cross-tenant (`team_id = null`). Aujourd'hui, sa logique d'autorisation est dispersée dans une dizaine de controllers sous forme de branches `if ($actor->hasRole('super_admin')) { ... } else { /* agency check */ }` — créant un risque de drift à chaque ajout de feature et noyant les capacités spécifiquement super-admin (modération d'agences, impersonation, audit cross-tenant) dans des endpoints partagés. Ce ticket extrait un **namespace `/api/admin/...`** dédié pour les actions strictement super-admin-only, tout en conservant les endpoints CRUD partagés (Property, Lease, Booking, …) unifiés.

## Objectif

Centraliser dans un namespace API dédié toutes les capacités strictement super-admin — modération d'agences, impersonation utilisateur, métriques système, audit cross-tenant — derrière un middleware `EnsureSuperAdmin` unique, sans dupliquer les CRUD partagés.

## Delta à produire

- [ ] Middleware `App\Http\Middleware\EnsureSuperAdmin` (alias `super-admin`) :
    - Probe `hasRole('super_admin')` sous `team_id = null`
    - 403 sinon (réponse JSON cohérente avec le reste de l'API)
- [ ] Fichier de routes dédié `routes/api/admin.php` avec `prefix('admin')` + middleware `['auth:sanctum', 'super-admin']`
- [ ] Controllers déplacés / créés sous `app/Http/Controllers/Api/Admin/` :
    - `Admin\AgencyModerationController` — verify / suspend / unverify / list-all-pending
    - `Admin\UserImpersonationController` — `POST /api/admin/users/{user}/impersonate` + `POST /api/admin/impersonate/stop` (Sanctum token éphémère, audit log obligatoire)
    - `Admin\SystemMetricsController` — KPIs cross-tenant (agences totales, users actifs, revenu plateforme, taux de vérification…)
    - `Admin\CrossTenantAuditController` — `GET /api/admin/audit` (sans le filtre agency, contrairement à `AuditLogController` qui reste pour agency_admin)
    - `Admin\FeatureFlagController` (P3 — filer un sous-ticket si trop large)
- [ ] FormRequests `Api\Admin\*` correspondants
- [ ] Resources `Api\Admin\*` (séparées des resources tenant-facing pour éviter les leaks d'attributs admin-only)
- [ ] Policies `App\Policies\Admin\*` au besoin (si la logique va au-delà du `hasRole('super_admin')` du middleware)
- [ ] Refactor des controllers existants (UserRoleController, AgencyController.update/destroy, AuditLogController, ActivityLogExporter, …) : retirer les branches `if super_admin` qui sont strictement super-admin-only — déplacées dans `Api\Admin\*` ; garder les branches qui élèvent simplement les droits sur un endpoint partagé
- [ ] Tests :
    - `Tests\Feature\Middleware\EnsureSuperAdminTest` — 200 / 403 / 401
    - `Tests\Feature\Api\Admin\AgencyModerationTest`
    - `Tests\Feature\Api\Admin\UserImpersonationTest` (token éphémère, expiration, audit)
    - `Tests\Feature\Api\Admin\SystemMetricsTest`
    - `Tests\Feature\Api\Admin\CrossTenantAuditTest`
    - `Tests\Feature\Api\Admin\NamespaceAccessGuardTest` — couverture systématique : pour chaque route admin, un agency_admin reçoit 403
- [ ] Activity log automatique sur les actions super-admin sensibles (impersonation start/stop, agency suspend/verify) — via `LogsActivity` ou `Audit::log()`
- [ ] Postman/OpenAPI mis à jour
- [ ] `./vendor/bin/pint` clean

## Critères d'acceptation

- [ ] Toute route sous `/api/admin/*` retourne 403 pour un user qui n'a pas `super_admin` (testé exhaustivement par `NamespaceAccessGuardTest`)
- [ ] Aucun endpoint hors `/api/admin/*` n'expose de capacité strictement super-admin (modération, impersonation, audit cross-tenant) — validé par grep + tests
- [ ] Les CRUD partagés (Property, Lease, Booking, …) restent à leur place et continuent de fonctionner pour super_admin via le mécanisme `Gate::before` existant — pas de duplication d'URLs
- [ ] L'impersonation produit un token Sanctum avec `name='impersonation'`, `expires_at` ≤ 1h, et logge un événement `super_admin_impersonation_started` avec `target_user_id` + `actor_id`
- [ ] Les tests existants des routes shared (Property, Lease…) restent verts sans modification (pas de régression sur le path super_admin → shared CRUD)
- [ ] La spec `features.md` §2.9 et §2.6 reste cohérente avec le code livré (les fonctionnalités P0/P1 admin sont câblées au namespace ; aucune n'a glissé hors-spec)

## Hors périmètre

- Frontend super-admin (TCK-145)
- Refonte des `UserRole` / `Permission` pour exposer une matrice admin distincte (P3, ticket dédié)
- Feature flags applicatifs (P3, sous-ticket si jugé prioritaire)
- Migration des audit logs historiques vers une table séparée admin-only (out of scope, audit unifié reste suffisant)

## Notes d'implémentation

- **Migration des routes TCK-098/101** (collateral imposé par l'AC littérale "Toute route sous `/api/admin/*` retourne 403 pour un user qui n'a pas `super_admin`") : `PropertyModerationController` (TCK-098) et `BookingController.expireNow` (TCK-101) servaient `agency_admin` sous `/api/admin/properties/...` et `/api/admin/bookings/...`. Routes déplacées :
    - `/api/admin/properties/moderation` → `/api/properties/moderation`
    - `/api/admin/properties/{id}/{approve|reject|resubmit}` → `/api/properties/{id}/...`
    - `/api/admin/bookings/{id}/expire-now` → `/api/bookings/{id}/expire-now`
    Le frontend (`takussan-web/src/lib/queries/property-moderation.ts`, 4 chemins) suit. Le contrôleur garde sa logique de gating (agency_admin OR super_admin) puisqu'elle n'est plus portée par le middleware.
- **Mapping `verify/suspend/unverify`** : appliqué sur `AgencyStatus` (pas de migration de schéma comme demandé). `verify` → `Active` + `is_verified=true` + `verified_at=now()`. `suspend` → `Suspended` (verification flag inchangée). `unverify` → `Inactive` + `is_verified=false` + `verified_at=null`. La colonne `is_verified` existait déjà sur `agencies` — utilisée pour préserver la sémantique de vérification.
- **Impersonation token TTL** : 60 min via `User::createToken('impersonation', ['*'], $expiresAt)`. Stop endpoint **gardé super-admin-only** : la frontend doit conserver les **deux** tokens (super_admin + impersonation) en parallèle, et utiliser le super_admin pour appeler `/api/admin/impersonate/stop` avec `{ user_id }`. Sans ça, un actor déjà sous le token target ne pourrait pas franchir le middleware. Le stop révoque tous les `PersonalAccessToken` `name='impersonation'` du target — ce qui couvre les sessions concurrentes.
- **`EnsureSuperAdmin` probe sous `team_id = null`** : un super_admin peut détenir un profil agence (et donc avoir `team_id` pinné par `ResolveActiveProfile`). Le middleware sauvegarde / restore le `team_id` autour de la probe pour ne pas perturber les permissions agence-scoped des handlers.
- **`NamespaceAccessGuardTest`** : la dataProvider statique de PHPUnit ne peut pas voir `Route::getRoutes()` (app pas bootstrapée). Implémenté en boucle inline pour itérer chaque route registered sous `api/admin/*` au moment du test — auto-extensible quand on ajoute une route au prefix.
- **Pas de FormRequest dédié** : les actions ont des inputs minimes (`/impersonate/stop` valide `user_id` inline ; les autres n'ont pas de body). Ajouter des `Api\Admin\*Request` sera utile quand on enrichira (raison de suspension, période d'impersonation paramétrable…).
- **Activity log `super_admin_*`** : événements emitted via `activity()` helper (pattern existant dans `PropertyModerationService`). Récupérables tels-quels par `CrossTenantAuditController` via `filter[event]=super_admin_agency_verified|...`.
- **Tests** : 23 nouveaux cas (5 fichiers + middleware + namespace guard), 1554/1554 verts. Pint clean.

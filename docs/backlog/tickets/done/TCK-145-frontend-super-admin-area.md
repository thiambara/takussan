---
id: TCK-145
title: "Frontend — Espace super-admin dédié hors layout agence"
status: done
phase: P1
family: front
estimate: M
wave: 16
created: 2026-05-02
updated: 2026-05-02
depends_on: [TCK-144]
blocks: []
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
    - docs/features.md#29-administration--configuration
    - docs/features.md#26-audit--traçabilité
  models:
    - docs/models-spec.md#1-user
tags: [front, super_admin, p1]
---

## Objectif utilisateur

Un super-admin Takussan dispose d'une interface dédiée — visuellement distincte du dashboard agence — pour modérer les agences, impersonifier un utilisateur en cas de support, lire les KPIs plateforme et auditer les actions cross-tenant. Aucun bandeau / module agence ne doit apparaître par erreur dans cette zone.

## Contrat de données

Endpoints fournis par TCK-144 sous `/api/admin/...` :

- `GET /api/admin/agencies?filter[status]=...&fields[agencies]=...` — liste / modération
- `POST /api/admin/agencies/{id}/verify` — `POST .../suspend` — `POST .../unverify`
- `POST /api/admin/users/{user}/impersonate` → `{ token, expires_at, actor_id, target_user_id }`
- `POST /api/admin/impersonate/stop`
- `GET /api/admin/system/metrics` — KPIs plateforme (agences totales, taux de vérification, users actifs, revenu plateforme…)
- `GET /api/admin/audit?filter[...]=...&include=causer,subject` — audit cross-tenant

Toujours utiliser `fields[...]`, `filter[...]`, `include=` côté client (cf. CLAUDE.md). Jamais de fan-out multi-endpoints quand un seul appel suffit.

## Direction UX / Artistique

- **Layout dédié** `(super-admin)` : sidebar et header **distincts** du layout agence (ex. fond plus sombre, accent rouge / ocre Takussan, libellé "Console Takussan").
- Sections : **Dashboard plateforme**, **Agences** (modération), **Utilisateurs** (recherche + impersonation), **Audit cross-tenant**, **Système** (paramètres globaux, intégrations, feature flags si livrés).
- **Bandeau permanent** quand une session d'impersonation est active : barre en haut "Vous agissez en tant que <user>" + bouton "Arrêter l'impersonation" toujours accessible.
- **Aucun module agence** dans ce layout (pas de KPIs agence, pas de "mes biens", pas de raccourcis CRM).
- Cohérent avec le design system (TCK-129) mais avec un thème visuel distinct pour signaler clairement le contexte super-admin.
- États vides explicites (aucune agence à modérer → message neutre, pas de stub).

## Contraintes strictes (métier)

- Routes sous `/admin/*` côté frontend (Next.js) doivent être **inaccessibles** sans le rôle `super_admin` — redirect vers `/app` si l'utilisateur n'a pas le rôle.
- Le rôle est lu depuis `GET /api/auth/me` (`roles` array) ; ne pas dériver depuis le profil actif (super_admin n'a pas de profil).
- L'impersonation doit afficher un bandeau **non dismissible** tant que la session d'impersonation est active. Le token d'impersonation expire ≤ 1h — le client doit anticiper la fin de session et proposer de relancer/stopper.
- Aucune action super-admin (suspension, vérification, impersonation) ne s'exécute sans une **double confirmation** côté UI.
- Les KPIs cross-tenant ne doivent **jamais** fuiter dans l'espace agence (`/app`, `/admin` agence).

## Delta à produire

- [ ] Layout `src/app/(super-admin)/admin/layout.tsx` distinct du layout `(dashboard)` — sidebar, header, palette de couleur dédiés
- [ ] Garde de route : redirect `/app` si `roles` ne contient pas `super_admin` (côté serveur via `getServerSession`, pas seulement côté client)
- [ ] Pages : `/admin` (dashboard plateforme), `/admin/agencies`, `/admin/agencies/[id]`, `/admin/users`, `/admin/audit`, `/admin/system`
- [ ] Composant `ImpersonationBanner` global, monté au layout — visible dès qu'une session d'impersonation est active
- [ ] Hook `useImpersonate(targetUserId)` — POST + bascule du token + redirect vers l'app cible — et `useStopImpersonation()`
- [ ] Composants `AgencyModerationCard`, `SystemMetricsGrid`, `CrossTenantAuditTable` (filterable, paginée)
- [ ] Modales de confirmation pour les actions sensibles (verify / suspend / impersonate)
- [ ] Tests UI : redirect non-super_admin, rendu liste agences + actions, flow impersonation start/stop, bandeau d'impersonation
- [ ] Cohérence avec le `ProfileSwitcher` (TCK-143) : super-admin n'expose pas de switcher (pas de profils)

## Critères d'acceptation

- [ ] Un user sans `super_admin` qui charge `/admin/...` est redirigé côté serveur (pas de flash de contenu)
- [ ] Le layout `(super-admin)` n'inclut aucun composant du layout agence (pas de `ProfileSwitcher`, pas de KPI agence, pas de raccourcis CRM)
- [ ] Une session d'impersonation active affiche un bandeau permanent jusqu'à `Stop` ou expiration
- [ ] Les actions modération (verify / suspend / impersonate) demandent une double confirmation
- [ ] Aucun appel ne fetch tous les champs (`fields[...]` toujours présent)
- [ ] Aucun appel ne filtre côté client sur des listes paginées
- [ ] Le dashboard plateforme charge les KPIs via un seul appel `GET /api/admin/system/metrics`
- [ ] L'audit cross-tenant respecte les filtres standard spatie (date range, action, causer)

## Hors périmètre

- Implémentation des endpoints `/api/admin/...` (TCK-144)
- Espace agency_admin existant (`/admin` agence — voir TCK-131) — ce ticket n'y touche pas
- Feature flags UI (P3, à filer si livré côté back)
- Maintenance programmée UI (P3)
- Internationalisation complète (les libellés peuvent rester en `fr` pour la première itération)

## Notes d'implémentation

- **Déviation URL `/admin/*` → `/super-admin/*`** : le ticket décrit `/admin/*`, mais TCK-131 l'occupe pour le dashboard agency_admin (et la section "Hors périmètre" interdit d'y toucher). Le nouvel espace vit sous `/super-admin/*` — l'intention (namespace dédié, layout séparé, garde server-side) est respectée. Le backend conserve `/api/admin/*` (TCK-144) ; le frontend proxy via `/api/super-admin/[...path]/route.ts` qui forward vers `/api/admin/...`.
- **Layout dédié** (`(super-admin)/super-admin/layout.tsx`) : redirect server-side vers `/app` si `roles` ne contient pas `super_admin` — pas de flash de contenu côté client. Palette stone-900 + amber, libellé "Console Takussan" pour différencier visuellement de l'espace agence.
- **`ImpersonationBanner` global** monté dans `SuperAdminShell` : affiche un bandeau non dismissible tant qu'une session d'impersonation est active. État porté en `localStorage` (`takussan.impersonation`), TTL respecté via `expires_at` ; `useImpersonationSession` consomme via `useSyncExternalStore` (snapshot caché pour stabilité référentielle — sinon boucle infinie sur React 19). Note : le bandeau n'apparaît que dans le shell super-admin pour la première itération ; pour l'afficher aussi dans `/app` (navigation post-impersonation), il faudra le monter dans `(dashboard)/layout.tsx` — ticket follow-up à filer si l'UX l'exige.
- **Stop impersonation** (`/api/super-admin/impersonate/stop`) : appelé avec le token super_admin (le frontend conserve les deux tokens). Backend (TCK-144) révoque tous les `PersonalAccessToken` `name='impersonation'` du target. Voir TCK-144 notes pour la rationale dual-token.
- **Double-confirmation** (`ConfirmActionDialog`) : utilisée par `AgencyModerationCard` (verify/suspend/unverify) et la page utilisateurs (impersonate). Phrase à retaper textuellement (VERIFIER / SUSPENDRE / DEVERIFIER / IMPERSONIFIER) avant que le bouton primaire ne s'active.
- **Page utilisateurs** : la liste s'appuie sur `GET /api/users` (TCK existant, super_admin/admin gated) via le proxy `/api/super-admin-users/route.ts` (pas sous `/api/super-admin/[...path]` car l'upstream backend n'est pas dans `/api/admin/*`).
- **Système / Feature flags / Maintenance** : la page `/super-admin/system` affiche les KPIs et un bloc neutre pour les paramètres globaux. Pas de stub interactif (P3 — ticket dédié quand le backend livre).
- **`fields[...]` partout** : sur la recherche utilisateurs (`fields[users]=id,first_name,last_name,full_name,email,roles,status`). Les autres endpoints super-admin retournent déjà des resources `Api\Admin\*` minimales (TCK-144).
- **Tests UI** : 4 cas (`ImpersonationBanner.test.tsx` × 3 + `ConfirmActionDialog.test.tsx` × 1). Couvrent : pas de session → null ; session active → banner ; click stop → POST + clear ; session expirée → masquée ; phrase de confirmation requise pour activer le submit. Tests Playwright/E2E pour la garde server-side et le flow complet → out-of-scope (pas d'infra E2E configurée pour l'instant).

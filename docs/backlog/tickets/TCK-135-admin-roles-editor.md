---
id: TCK-135
title: "/admin/roles — Éditeur de rôles & permissions personnalisés (agency_admin)"
status: review
phase: P1
family: full
estimate: M
created: 2026-05-02
updated: 2026-05-03
depends_on: [TCK-014, TCK-141]
blocks: []
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#1-user
tags: [front, admin, roles, permissions, p1]
---

## Objectif utilisateur

Un agency_admin accède à `/admin/roles` pour consulter les rôles disponibles et créer/éditer des rôles personnalisés à **son agence courante (profil actif)** (basés sur `spatie/laravel-permission` avec teams), sans page « En cours de développement ».

## Impact TCK-138 → TCK-146

- **`team_id` posé par le profil actif** : depuis TCK-141 / TCK-142, le scope spatie n'est plus dérivé de `users.agency_id` (colonne supprimée) mais du **profil actif** résolu par `ResolveActiveProfile`. Aucun `filter[agency_id]` à passer côté client : le backend list-scope les rôles selon le `team_id` courant. Pour la portée plateforme cross-tenant (super_admin), prévoir un ticket frontend dédié sous `/super-admin/roles` (hors périmètre).
- **Rôles prédéfinis** : la liste reste `customer`, `agent`, `agency_admin`, `owner`, `service_provider`, `broker`, `admin`, `super_admin`. Les rôles `super_admin` et `admin` (global) sont seedés sous `team_id = null` et ne doivent pas apparaître éditables ici.
- **Détection super_admin** : via `User::isSuperAdmin()` (probe team_id=null) côté backend ; côté frontend via `roles` array de `/auth/me`. Ne **jamais** dériver depuis le profil actif.
- **Bascule de profil** (TCK-143) : un agency_admin avec plusieurs profils peut basculer — la liste de rôles custom doit alors se réinvalider (les rôles custom sont scopés par `team_id`).

## Contrat de données

Endpoints livrés par TCK-014 (rôles & permissions) — `spatie/laravel-permission` avec teams scopées via le profil actif :
- `GET /api/roles` (rôles prédéfinis + custom de l'agence courante, scope auto via team_id)
- `GET /api/permissions` (catalogue des permissions disponibles)
- `POST /api/roles` / `PATCH /api/roles/{id}` / `DELETE /api/roles/{id}` (custom uniquement)
- `POST /api/roles/{id}/permissions` / `DELETE /api/roles/{id}/permissions/{permission}`

Conventions Spatie côté frontend : `fields[roles]=`, `include=permissions`, `filter[scope]=agency|global`. Aucun `filter[agency_id]` — le backend impose le scope via le `team_id` du profil actif.

## Direction UX / Artistique

- Vue **deux colonnes** : à gauche la liste des rôles (prédéfinis + custom), à droite l'éditeur du rôle sélectionné.
- L'éditeur expose les permissions groupées par ressource (Property, Booking, Lease, ...) avec checkboxes et distinction « mes ressources » vs « toutes les ressources ».
- Les rôles prédéfinis (customer, agent, agency_admin, owner, service_provider, broker, admin, super_admin) sont **lecture seule** — affichés mais non éditables.
- Bouton "Nouveau rôle personnalisé" avec dialog de création (nom + permissions de base).
- État de comparaison : montrer ce qui change avant validation.
- Aucun StubPlaceholder.

## Contraintes strictes (métier)

- Page accessible uniquement aux rôles disposant de la permission `roles.manage_in_agency` (agency_admin) — voir TCK-014. La portée super_admin globale est hors périmètre (ticket dédié `/super-admin/roles` à filer si besoin).
- Un agency_admin ne peut créer/éditer que des rôles **scopés à son profil actif** (team_id spatie posé par `ResolveActiveProfile`, TCK-141).
- Les rôles prédéfinis ne sont jamais modifiables ni supprimables.
- Suppression d'un rôle custom interdite s'il est encore attribué à un utilisateur (le backend renvoie l'erreur, le frontend l'affiche clairement).
- Toute mutation déclenche un `ActivityLog` côté backend.
- Bascule de profil (TCK-143) : invalider les queries `['roles']` et `['permissions']` après un switch — les rôles custom changent de scope.

## Delta à produire

- [ ] Page UI: `src/app/(dashboard)/admin/roles/page.tsx` — retirer `<StubPlaceholder>`
- [ ] Composants `RolesList`, `RoleEditor`, `PermissionMatrix`, `CreateRoleDialog`
- [ ] Hooks React Query : liste rôles, mutations CRUD, mutations permissions
- [ ] Garde permission frontend (état dégradé si non autorisé)
- [ ] Confirmation explicite à la suppression d'un rôle (avec alerte si attribué)
- [ ] Skeletons et états vides
- [ ] Tests UI : guard, scope agence, lecture seule des rôles prédéfinis

## Critères d'acceptation

- [ ] La page n'affiche plus `<StubPlaceholder>`
- [ ] La liste affiche les rôles prédéfinis et les rôles custom de **l'agence du profil actif**
- [ ] Sélectionner un rôle prédéfini ouvre l'éditeur en lecture seule
- [ ] Sélectionner un rôle custom permet de cocher/décocher les permissions et de sauvegarder
- [ ] Créer un rôle custom est possible via un dialog dédié
- [ ] Supprimer un rôle attribué affiche une erreur explicite
- [ ] Un agency_admin ne voit/ne touche pas aux rôles d'une autre agence (scope imposé par `team_id` du profil actif)
- [ ] Une bascule de profil (TCK-143) provoque un refetch automatique de la liste
- [ ] Aucun fetch ne retourne tous les champs (sparse fieldsets)

## Hors périmètre

- Délégation temporaire de permissions (TCK-108)
- Règles conditionnelles / policies dynamiques (P3)
- Édition des rôles prédéfinis (jamais modifiables)
- Modification des rôles d'un utilisateur (TCK-133)
- Vue super_admin globale des rôles cross-tenant (ticket dédié `/super-admin/roles` à filer si besoin)

## Notes d'implémentation

- **Famille élargie `front` → `full`** : la « Contrat de données » du ticket
  référence `GET /api/roles`, `GET /api/permissions` et des endpoints
  granulaires de permissions qui n'avaient pas été livrés par TCK-014. Le
  shipping de TCK-014 expose `/api/agency-roles` (custom uniquement, sync
  full des permissions via `PUT`). Décision (avec l'utilisateur) : bundle
  backend + frontend dans le même PR pour rester aligné sur la spec, plutôt
  que d'adapter le frontend aux endpoints existants ou de créer un ticket
  backend prérequis.
- **Backend nouveau** :
  - `App\Http\Controllers\Api\RoleController` (index/store/update/destroy +
    `attachPermission`/`detachPermission`). Resolu via
    `app(PermissionRegistrar::class)->teamsKey` (la colonne réelle est
    `agency_id`, pas `team_id` — config spatie `team_foreign_key`).
  - `App\Http\Controllers\Api\PermissionController` (index → catalogue groupé
    par préfixe `<resource>`).
  - `routes/api/roles.php` (auto-loadé par `routes/api.php`). Les anciennes
    routes `/api/agency-roles` et `AgencyRoleController` ont été supprimées —
    seul `tests/Feature/Api/AgencyAgentTest.php` les utilisait, les tests
    role-management ont été déplacés dans le nouveau `RoleControllerTest`.
- **Permission `roles.manage_in_agency`** : ajoutée au seeder
  `RolesAndPermissionsSeeder` et accordée au rôle `agency_admin`. Le
  `RoleController::authorizeAgencyManager` court-circuite via `isSuperAdmin()`
  / `hasRole('admin')` pour rester cohérent avec `Gate::before`.
- **Refus de mutation des rôles prédéfinis** : `ensureCustomRoleInAgency`
  rejette `team_id IS NULL` avant le check inter-agence. Couvert par les
  tests `cannot_update_predefined_role`,
  `cannot_destroy_predefined_role`, `cannot_attach_permission_to_predefined_role`.
- **Suppression bloquée si rôle attribué** : `destroy` 422 si `users()->count() > 0`,
  message FR explicite (`Impossible de supprimer ce rôle : il est attribué à N utilisateur(s).`).
  Le frontend l'affiche via le bloc `role-editor-delete-error`.
- **Active profile `team_id` resolution** : `resolveAgencyId()` privilégie
  `$request->activeProfile()?->agency_id` puis tombe sur la colonne legacy
  jusqu'au cutover TCK-142 — pattern identique à
  `UserAdminController` / `DashboardController`.
- **Frontend invalidation sur switch de profil** : `useSwitchActiveProfile`
  invalide désormais `['roles']` et `['permissions']` en plus des clés
  existantes, pour respecter l'AC « Une bascule de profil provoque un refetch
  automatique ».
- **Reset d'éditeur via `key`** : le composant `RoleEditor` est remonté par
  `AdminRolesClient` avec `key={role.id}` plutôt que `useEffect(setState)`
  pour respecter la règle ESLint `react-hooks/no-setstate-in-effect`.
- **Sparse fieldsets** : `ADMIN_ROLES_FIELDS` épingle
  `id,name,guard_name,team_id`. `permissions` est chargé via `include=permissions`
  (relation, donc hors `fields[roles]`).
- **Tests** :
  - Backend : `tests/Feature/Api/RoleControllerTest` (23 cas — index scopes,
    create/update/destroy custom + predefined guards, granular
    attach/detach, super_admin bypass, catalogue grouping/forbidden).
    Suite complète : 1590/1590 passing.
  - Frontend : `RolesList.test.tsx` (4), `RoleEditor.test.tsx` (4),
    `AdminRolesClient.test.tsx` (3) — 11 cas. Lint : 0 erreurs sur les
    fichiers TCK-135.
- **Smoke test browser** (Chrome devtools, dev server :3000 + API :8002,
  acteur `admin@dakarimmo.sn` agency_admin scopé sur agency 1) :
  - `/admin/roles` charge la liste : 8 rôles prédéfinis (`Admin plateforme`,
    `Admin d'agence`, `Agent`, `Client`, `Propriétaire`, `Prestataire`,
    `Super admin`, `Locataire`) + section custom vide.
  - `POST /api/roles` (`comptable_test` + 3 perms) → 201, le rôle apparaît
    dans la section RÔLES PERSONNALISÉS et est auto-sélectionné.
  - Toggle d'une permission (`invoices.update`) : « Enregistrer » s'active,
    `PATCH /api/roles/{id}` persiste, le serveur renvoie le diff attendu.
  - `DELETE /api/roles/{id}` avec rôle assigné → 422 message FR
    « Impossible de supprimer ce rôle : il est attribué à 1 utilisateur(s). »
    affiché dans le bandeau d'erreur de l'éditeur.
  - Cross-agency : depuis agency 1, un rôle créé en agency 2 est invisible
    et toute mutation directe par id renvoie 403.
  - Catalogue `/api/permissions` chargé, `roles.manage_in_agency` apparaît
    dans la section Rôles.
- **Bugfix découvert pendant le smoke** : le proxy `/api/roles/[[...path]]`
  retournait 500 sur les réponses 204 (`new NextResponse('null', { status: 204 })`
  est interdit par le standard fetch). Corrigé : pour 204/205/304, on
  renvoie un body `null` explicite. Vérifié end-to-end (`createStatus: 201`,
  `deleteStatus: 204`).

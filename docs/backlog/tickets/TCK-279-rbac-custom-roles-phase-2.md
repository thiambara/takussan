---
id: TCK-279
title: "RBAC refondu — phase 2 : rôles personnalisés par agence (HasRoles sur Profils + AgencyRole)"
status: blocked
phase: P1
family: full
estimate: L
created: 2026-05-17
updated: 2026-05-17
depends_on: [TCK-278]
blocks: []
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
    - docs/features.md#29-administration--configuration
    - docs/features.md#112-agence--équipe
  models:
    - docs/models-spec.md#52-agencyrole--tck-279
    - docs/models-spec.md#53-agencyrolecapability--tck-279
    - docs/models-spec.md#règle-6--1-profil--1-rôle-personnalisé
    - docs/models-spec.md#catalogue-capability-tck-278--tck-279
tags: [back, front, security, rbac, p1, supersedes-tck-135]
---

## Objectif utilisateur

Un `agency_admin` accède à `/admin/roles` pour consulter les rôles métier disponibles (Agent, Administrateur, Propriétaire, Prestataire) et **créer/cloner des rôles personnalisés** dans son agence (« Manager équipe Nord », « Agent senior », « Comptable »), en sélectionnant les capacités atomiques accordées. Les rôles personnalisés sont assignables aux membres existants depuis la console Équipe (TCK-277).

**Supersede TCK-135** (admin-roles-editor) : la version spatie+teams est abandonnée au profit du modèle Profile + AgencyRole établi en TCK-278.

## Contrat de données

**Modèles ajoutés** (cf. spec §52-§53) :
- `AgencyRole` (`agency_roles`)
- `AgencyRoleCapability` (`agency_role_capabilities` — pivot)

**Modèles retouchés** :
- `AgentProfile`, `AgencyAdminProfile`, `OwnerProfile`, `ServiceProviderProfile` : ajout colonne `agency_role_id` (FK NOT NULL, restrictOnDelete), trait `HasRoles` (variante dérivée pointant vers `agency_roles` et `agency_role_capabilities`), méthodes `capabilities(): Collection<Capability>`, `hasCapability(Capability): bool`.
- `Agency` : observer / job qui seed les 4 `AgencyRole` système (`is_system=true`) à la création.

**Endpoints** :
- `GET /api/agencies/{agency}/roles` — liste des rôles de l'agence (filtres : `is_system`, `base_profile_type`).
- `POST /api/agencies/{agency}/roles` — crée un rôle custom (ou clone d'un système).
- `PATCH /api/agencies/{agency}/roles/{role}` — édite un rôle non-système.
- `DELETE /api/agencies/{agency}/roles/{role}` — supprime un rôle non-système (refusé si utilisé).
- `PUT /api/agencies/{agency}/roles/{role}/capabilities` — remplace l'ensemble des capacités du rôle (sync).
- `PATCH /api/profiles/{profile}/agency-role` — réaffecte un profil à un autre `AgencyRole`.
- `GET /api/capabilities` — catalogue plateforme des `Capability` (lecture, code-defined, groupé par domaine pour l'UI).

**Resolver** : `MembershipCapabilityResolver` consulte désormais `Profile->agencyRole->capabilities` au lieu de la table de vérité phase 1. **Signature publique inchangée** — les sites d'appel `$user->canActAt(Capability, $agency)` ne bougent pas.

## Direction UX / Artistique

- Page `/admin/roles` accessible aux `agency_admin` (typology gate `standard`).
- Layout : liste à gauche (rôles existants groupés par `base_profile_type`, badge « système » non éditable), éditeur à droite (formulaire nom + description + matrice de capacités groupées par domaine).
- Matrice de capacités : sections collapsibles par domaine (`agency.*`, `team.*`, `properties.*`, …), case à cocher par capacité.
- Bouton « Cloner » sur les rôles système, « Modifier » / « Supprimer » sur les customs.
- Modal de suppression bloquée si des profils utilisent le rôle (avec lien vers la liste des profils concernés).
- Page « Équipe » (TCK-277) enrichie : colonne « Rôle » affiche le nom de l'`AgencyRole` (au lieu du base type seul) ; modal d'édition de profil expose un sélecteur `AgencyRole` filtré par `base_profile_type`.

## Contraintes strictes (métier)

- **Règle 6** (cf. spec) : 1 profil = 1 `agency_role_id` NOT NULL. Pas de M:N, pas de fallback nullable.
- Modèle additif uniquement (pas de deny override).
- Rôle système (`is_system=true`) : non éditable, non supprimable, présent exactement une fois par `(agency_id, base_profile_type)`.
- Cloner un rôle = nouvelle ligne `is_system=false` avec copie des capacités source ; pas de lien rétroactif vers le rôle parent.
- Suppression d'un rôle utilisé : 409 Conflict avec liste des profils en cause.
- Validation `capability` : refus 422 si la valeur n'est pas dans l'enum `Capability` côté serveur.
- L'utilisateur courant ne peut s'auto-rétrograder vers un rôle qui lui retire `team.assign_role` si c'est le dernier admin de l'agence (règle « last admin »).
- Le `MembershipCapabilityResolver` met en cache la matrice par profil (TTL court ou cache-tag invalidé sur édition de rôle / réaffectation), pour éviter une requête à chaque check.

## Delta à produire

### Backend

- [ ] Migration : `create_agency_roles_table` (cf. spec §52).
- [ ] Migration : `create_agency_role_capabilities_table` (cf. spec §53).
- [ ] Migration : `add_agency_role_id_to_profile_tables` (sur `agent_profiles`, `agency_admin_profiles`, `owner_profiles`, `service_provider_profiles` ; nullable d'abord, backfill, puis NOT NULL).
- [ ] Migration de données : `backfill_agency_roles_seed_system` — pour chaque agence existante, seed les 4 rôles système (`is_system=true`) avec les capacités issues de la table de vérité phase 1 (`MembershipCapabilityResolver`). Pour chaque profil existant, set `agency_role_id` vers le rôle système correspondant à son type.
- [ ] Model : `App\Models\AgencyRole` (étend `AbstractModel`, scopes, relations `agency()`, `capabilities()`, `*_profiles()`).
- [ ] Model : `App\Models\AgencyRoleCapability` (pivot fin).
- [ ] Trait : `HasAgencyRole` sur les modèles `AgentProfile`, `AgencyAdminProfile`, `OwnerProfile`, `ServiceProviderProfile`. Méthodes `capabilities(): Collection`, `hasCapability(Capability): bool`, `agencyRole(): BelongsTo`.
- [ ] Refactor `MembershipCapabilityResolver` : consulte désormais `Profile->agencyRole->capabilities` (avec cache). La table de vérité phase 1 devient le seed initial des rôles système.
- [ ] Observer `AgencyObserver::created` : seed automatique des 4 rôles système à la création d'une agence.
- [ ] Controller : `App\Http\Controllers\Api\Agency\RoleController` (CRUD agences/{id}/roles + capabilities).
- [ ] Controller : `App\Http\Controllers\Api\Profile\AgencyRoleController` (PATCH /profiles/{id}/agency-role).
- [ ] Controller : `App\Http\Controllers\Api\CapabilityController` (GET /capabilities — catalogue plateforme).
- [ ] FormRequests : `StoreAgencyRoleRequest`, `UpdateAgencyRoleRequest`, `SyncCapabilitiesRequest`, `AssignAgencyRoleRequest`.
- [ ] Policies : `AgencyRolePolicy` (view/create/update/delete — agency_admin scoped).
- [ ] Resources : `AgencyRoleResource` (incluant le compte de profils utilisateurs).
- [ ] Suppression de l'enum `UserRole` (déjà `@deprecated` en TCK-278).
- [ ] Tests : `AgencyRoleControllerTest`, `AgencyRoleCapabilitiesTest`, `AgencyRoleAssignmentTest`, `LastAdminGuardTest`, `MembershipCapabilityResolverCacheTest`, `AgencySeedSystemRolesTest`.

### Frontend

- [ ] Page `/admin/roles` (refacto / reprise propre de la page TCK-135) : liste + éditeur.
- [ ] Composants : `AgencyRolesList`, `AgencyRoleEditor`, `CapabilityMatrix` (sections collapsibles par domaine).
- [ ] Queries : `src/lib/queries/agency-roles.ts` (fetch list / create / update / delete / syncCapabilities).
- [ ] Queries : `src/lib/queries/capabilities.ts` (fetch catalogue, mémoïsé via tanstack-query staleTime infini).
- [ ] TeamConsole (TCK-277) enrichie : colonne « Rôle » affiche `agency_role.name` (au lieu du base type), modal de profil expose un `Select` `AgencyRole` filtré par `base_profile_type`.
- [ ] Hook `useCan(Capability)` : consomme les capabilities du profil actif (servies via `/api/me` ou `/api/me/capabilities`) et expose `(can: boolean, isLoading: boolean)`.
- [ ] Gates UI : remplacer les `isAgencyAdmin(user.roles)` qui contrôlent une feature granulaire par `useCan(Capability::xxx)`.

## Critères d'acceptation

- [ ] AC1 — À la création d'une agence, 4 `AgencyRole` `is_system=true` sont seedés automatiquement (Agent, Administrateur, Propriétaire, Prestataire) avec les capacités issues de la table de vérité phase 1.
- [ ] AC2 — `GET /api/agencies/{id}/roles` retourne la liste avec leur `base_profile_type`, `is_system` et `capabilities[]`.
- [ ] AC3 — `POST /api/agencies/{id}/roles` avec `{name, base_profile_type, clone_from?}` crée un rôle custom (avec capacités vides ou copiées du rôle source).
- [ ] AC4 — Tenter d'éditer un rôle `is_system=true` → 403.
- [ ] AC5 — `DELETE` d'un rôle utilisé → 409 avec liste des profils en cause.
- [ ] AC6 — `PUT /api/agencies/{id}/roles/{r}/capabilities` remplace l'ensemble des capacités du rôle ; valeurs hors enum → 422.
- [ ] AC7 — `PATCH /api/profiles/{p}/agency-role` réaffecte un profil ; refusé si la cible n'est pas du même `base_profile_type`.
- [ ] AC8 — Un user dont l'`AgencyRole` n'a pas la capacité `Capability::PropertiesPublish` voit son action « publier » refusée (403) ; un user dont le rôle l'a peut publier.
- [ ] AC9 — `MembershipCapabilityResolver` met bien en cache et invalide à : édition de rôle, sync capabilities, réaffectation de profil.
- [ ] AC10 — Le dernier `agency_admin` ne peut pas être réaffecté à un rôle sans `team.assign_role` (422 + message dédié).
- [ ] AC11 — UI `/admin/roles` : un agency_admin peut créer un rôle « Agent senior » avec une matrice de capacités, et l'assigner à un membre depuis la console Équipe.
- [ ] AC12 — Tous les checks UI granulaires (boutons, sections) passent par `useCan(Capability)` plutôt que `isAgencyAdmin`.
- [ ] AC13 — TCK-135 marqué `obsolete` dans l'INDEX avec lien vers TCK-279.

## Hors périmètre

- Permissions « négatives » (deny override) — non, modèle additif seulement.
- Rôles M:N sur un profil — non, règle 6.
- Rôles personnalisés au niveau plateforme (PlatformProfile) — pas dans le MVP.
- Héritage entre rôles personnalisés — non, flat.
- Audit dédié des changements de rôle (au-delà du `LogsActivity` standard) — ticket séparé si besoin.
- Profile-isation de `customer` / `tenant` — toujours hors scope.

## Notes d'implémentation

_(à remplir par implementing-specs)_

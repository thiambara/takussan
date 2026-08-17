---
id: TCK-279
title: "RBAC refondu — phase 2 : rôles personnalisés par agence (AgencyRole + pivot de capacités)"
status: review
phase: P1
family: full
estimate: L
wave: 34
created: 2026-05-17
updated: 2026-08-17
depends_on: [TCK-278]
blocks: [TCK-304, TCK-305, TCK-306, TCK-307, TCK-308, TCK-309]
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

## ⚠️ Correction avant implémentation — le trait `HasRoles` n'existe pas

Le titre et le corps de ce ticket parlaient d'un « trait `HasRoles` sur les Profils », repris de
`models-spec.md` qui décrivait la phase 2 comme une « réintroduction de `HasRoles` + `HasPermissions` ».

**C'est impossible, et il vaut mieux le lire ici que le découvrir en codant** : ces deux traits
appartiennent à `spatie/laravel-permission`, **désinstallé** par TCK-278, et une garde d'`api-ci.yml`
casse sur tout import `Spatie\Permission\`. La spec a été corrigée le 2026-08-16 par TCK-310 ; ce
ticket l'est ici.

Ce que la phase 2 décrit réellement est un mécanisme **maison** : `AgencyRole`, le pivot
`agency_role_capabilities`, et un pointeur `agency_role_id` sur chaque profil. **Le pointeur suffit —
aucun trait tiers n'est nécessaire.** Le trait maison à écrire s'appelle `HasAgencyRole`.

*Un ticket qui cite le nom d'un mécanisme supprimé envoie son implémenteur l'installer.*

## Contrat de données

**Modèles ajoutés** (cf. spec §52-§53) :
- `AgencyRole` (`agency_roles`)
- `AgencyRoleCapability` (`agency_role_capabilities` — pivot)

**Modèles retouchés** :
- `AgentProfile`, `AgencyAdminProfile`, `OwnerProfile`, `ServiceProviderProfile` : ajout colonne `agency_role_id` (FK NOT NULL, restrictOnDelete), trait maison `HasAgencyRole` (**pas** `HasRoles` — voir l'encadré ci-dessous), méthodes `capabilities(): Collection<Capability>`, `hasCapability(Capability): bool`.
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

- [x] Migration : `create_agency_roles_table` (cf. spec §52).
- [x] Migration : `create_agency_role_capabilities_table` (cf. spec §53).
- [x] Migration : `add_agency_role_id_to_profile_tables` — **sur trois tables, pas quatre** : `agent_profiles`, `agency_admin_profiles`, `owner_profiles`. `service_provider_profiles` en est exclue, cf. notes ⑵.
- [x] Migration de données : `backfill_agency_roles_seed_system` — pour chaque agence existante, seed les 4 rôles système (`is_system=true`) avec les capacités issues de la table de vérité phase 1 (`MembershipCapabilityResolver`). Pour chaque profil existant, set `agency_role_id` vers le rôle système correspondant à son type.
- [x] Model : `App\Models\AgencyRole` (étend `AbstractModel`, scopes, relations `agency()`, `capabilities()`, `*_profiles()`).
- [x] Model : `App\Models\AgencyRoleCapability` (pivot fin).
- [x] Trait : `HasAgencyRole` sur `AgentProfile`, `AgencyAdminProfile`, `OwnerProfile` (**pas** `ServiceProviderProfile`, cf. notes ⑵). Méthodes `capabilities(): Collection`, `hasCapability(Capability): bool`, `agencyRole(): BelongsTo`.
- [x] Refactor `MembershipCapabilityResolver` : consulte désormais `Profile->agencyRole->capabilities` (avec cache). La table de vérité phase 1 devient le seed initial des rôles système.
- [x] Observer `AgencyObserver::created` : seed automatique des 4 rôles système à la création d'une agence.
- [x] Controller : `App\Http\Controllers\Api\Agency\RoleController` (CRUD agences/{id}/roles + capabilities).
- [x] Controller : `App\Http\Controllers\Api\Profile\AgencyRoleController` (PATCH /profiles/{id}/agency-role).
- [x] Controller : `App\Http\Controllers\Api\CapabilityController` (GET /capabilities — catalogue plateforme).
- [x] FormRequests : `StoreAgencyRoleRequest`, `UpdateAgencyRoleRequest`, `SyncCapabilitiesRequest`, `AssignAgencyRoleRequest`.
- [x] Policies : `AgencyRolePolicy` (view/create/update/delete — agency_admin scoped).
- [x] Resources : `AgencyRoleResource` (incluant le compte de profils utilisateurs).
- [ ] ~~Suppression de l'enum `UserRole`~~ — **NON FAIT, et délibérément** : cf. notes ⑶.
- [x] Tests : `AgencyRoleControllerTest`, `AgencyRoleCapabilitiesTest`, `AgencyRoleAssignmentTest`, `LastAdminGuardTest`, `MembershipCapabilityResolverCacheTest`, `AgencySeedSystemRolesTest`.

### Frontend

- [x] Page `/admin/roles` (refacto / reprise propre de la page TCK-135) : liste + éditeur.
- [x] Composants : `AgencyRolesList`, `AgencyRoleEditor`, `CapabilityMatrix` (sections collapsibles par domaine).
- [x] Queries : `src/lib/queries/agency-roles.ts` (fetch list / create / update / delete / syncCapabilities).
- [x] Queries : `src/lib/queries/capabilities.ts` (fetch catalogue, mémoïsé via tanstack-query staleTime infini).
- [x] TeamConsole (TCK-277) enrichie : colonne « Rôle » affiche `agency_role.name` (au lieu du base type), modal de profil expose un `Select` `AgencyRole` filtré par `base_profile_type`.
- [x] Hook `useCan(Capability)` : consomme les capabilities du profil actif (servies via `/api/me/capabilities`) et expose `(can: boolean, isLoading: boolean)`.
- [x] Gates UI : remplacer les gates de TYPE qui contrôlent une feature granulaire par `useCan(Capability::xxx)` — cf. notes ⑻.

## Critères d'acceptation

- [x] AC1 — À la création d'une agence, 4 `AgencyRole` `is_system=true` sont seedés automatiquement (Agent, Administrateur, Propriétaire, Prestataire) avec les capacités issues de la table de vérité phase 1.
- [x] AC2 — `GET /api/agencies/{id}/roles` retourne la liste avec leur `base_profile_type`, `is_system` et `capabilities[]`.
- [x] AC3 — `POST /api/agencies/{id}/roles` avec `{name, base_profile_type, clone_from?}` crée un rôle custom (avec capacités vides ou copiées du rôle source).
- [x] AC4 — Tenter d'éditer un rôle `is_system=true` → 403.
- [x] AC5 — `DELETE` d'un rôle utilisé → 409 avec liste des profils en cause.
- [x] AC6 — `PUT /api/agencies/{id}/roles/{r}/capabilities` remplace l'ensemble des capacités du rôle ; valeurs hors enum → 422.
- [x] AC7 — `PATCH /api/profiles/{p}/agency-role` réaffecte un profil ; refusé si la cible n'est pas du même `base_profile_type`.
- [x] AC8 — Un user dont l'`AgencyRole` n'a pas la capacité `Capability::PropertiesPublish` voit son action « publier » refusée (403) ; un user dont le rôle l'a peut publier.
- [x] AC9 — `MembershipCapabilityResolver` met bien en cache et invalide à : édition de rôle, sync capabilities, réaffectation de profil.
- [x] AC10 — Le dernier `agency_admin` ne peut pas être réaffecté à un rôle sans `team.assign_role` (422 + message dédié).
- [x] AC11 — UI `/admin/roles` : un agency_admin peut créer un rôle « Agent senior » avec une matrice de capacités, et l'assigner à un membre depuis la console Équipe. **Vérifié en navigateur**, pas seulement par tests — cf. notes ⑽.
- [x] AC12 — Tous les checks UI granulaires (boutons, sections) passent par `useCan(Capability)` plutôt qu'un test de type de profil. ⚠ La portée réelle n'est pas celle que l'énoncé laisse croire : cf. notes ⑻.
- [x] AC13 — TCK-135 marqué `obsolete` dans l'INDEX avec lien vers TCK-279.

## Reste sur dev

**Livré en deux passes.** Backend d'abord (AC1–AC10, AC13, PR #176), couche de
données du front ensuite (PR #195), puis l'UI (AC11–AC12, branche
`wave1/rbac-ui`). Le ticket est resté `doing` entre les deux premières : le
basculer `done` aurait laissé croire qu'`/admin/roles` existait, alors que seule
la surface d'API était consommable.

⚠️ **Ce qui reste, une fois cette dernière passe mergée — aucun AC** :

- la décision `service_provider` (note ⑵) — **TCK-315**, ADR requis avant code ;
- la suppression de l'enum `UserRole` (note ⑶) — pas un nettoyage, une
  conception : cf. « Reste à faire côté backend » en bas de fiche ;
- `VisitDetail.tsx` reste sur un test de TYPE faute de domaine `visits.*` au
  catalogue (note ⑻).

*Le titre de cette section est conservé tel quel : `check-backlog.mjs` s'en sert
comme ancre pour toute fiche `doing`/`review` dont du code est déjà sur `dev`. La
renommer casserait la garde le jour où ce statut redevient `doing`.*

Fait et mergé — AC1 à AC10 et AC13, adossés à 138 tests verts (`AgencyRoleControllerTest`,
`AgencyRoleCapabilitiesTest`, `AgencyRoleAssignmentTest`, `LastAdminGuardTest`,
`MembershipCapabilityResolverCacheTest`, `AgencySeedSystemRolesTest`) :

- les 5 migrations, `AgencyRole` / `AgencyRoleCapability`, le trait `HasAgencyRole` ;
- `MembershipCapabilityResolver` bascule sur le pivot, avec cache par rôle ;
- `RoleController`, `Api\Profile\AgencyRoleController`, `CapabilityController` ;
- `AgencyRolePolicy`, les 4 FormRequests, `AgencyRoleResource` ;
- le seed des rôles système par `AgencyObserver::created` et par la migration de backfill.

Fait dans la passe frontend — AC11 et AC12 :

- page `/admin/roles` (`(dashboard)/admin/roles/page.tsx`) et les composants
  `AgencyRolesConsole`, `AgencyRolesList`, `AgencyRoleEditor`, `CapabilityMatrix`,
  `CreateRoleDialog`, `DeleteRoleDialog`, `MemberAgencyRoleSelect` ;
- la colonne « Rôle » de la TeamConsole et son sélecteur filtré par
  `base_profile_type`, adossés au nouvel endpoint `GET
  /api/agencies/{agency}/role-assignments` (cf. notes ⑼) ;
- entrée de barre latérale `/admin/roles` + `PRO_ROUTES` (gate typologie
  `standard`, gardée en SSR par `ensureStandardAgencyOrRedirect`) ;
- 176 clés i18n dans les **trois** locales (`admin.roles.*`, `nav.admin.roles`).

Une décision reste ouverte et n'a pas bloqué le frontend : où vit le rôle d'agence d'un
prestataire (`service_provider_profiles` n'a pas de `agency_role_id`). Elle est
ticketée à part — **TCK-315**. L'UI ne propose donc pas `service_provider` à la
création (`ASSIGNABLE_BASE_TYPES`), mais **affiche** son rôle système dans la liste.

## Hors périmètre

- Permissions « négatives » (deny override) — non, modèle additif seulement.
- Rôles M:N sur un profil — non, règle 6.
- Rôles personnalisés au niveau plateforme (PlatformProfile) — pas dans le MVP.
- Héritage entre rôles personnalisés — non, flat.
- Audit dédié des changements de rôle (au-delà du `LogsActivity` standard) — ticket séparé si besoin.
- Profile-isation de `customer` / `tenant` — toujours hors scope.

## Notes d'implémentation

**Passe BACKEND uniquement (2026-08-16).** Le frontend n'est pas commencé : le ticket reste `doing`,
son delta n'est pas complet. AC1–AC10 sont verts, AC11–AC13 restent rouges.

### ⑴ Le cache est indexé par rôle, pas par profil — et la spec se contredisait

Le ticket demande « met en cache la matrice **par profil** » ; la spec §52 dit l'inverse —
« l'édition d'un rôle non-système prend effet **immédiatement** pour tous les profils attachés
(pas de cache) ». Les deux sont tenus par un cache indexé par `agency_role_id` avec invalidation
**synchrone** (`AgencyRoleCapabilityCache`, hooks `saved`/`deleted` du modèle + purge explicite
après le sync du pivot, qui ne déclenche aucun hook Eloquent).

La raison est l'invalidation, pas la performance : indexée par rôle, elle est totale et locale —
une édition purge exactement une clé. Indexée par profil, la même édition exigerait de balayer N
profils, et un oubli laisserait un utilisateur avec des droits périmés **sans que rien ne le
signale**. La réaffectation d'un profil ne demande aucune purge : le profil pointe vers une autre
clé, déjà juste.

### ⑵ `service_provider_profiles` n'a PAS reçu `agency_role_id` — décision à trancher

Le delta et la Règle 6 citent quatre tables. La quatrième n'a **aucune colonne `agency_id`** et son
`user_id` est UNIQUE : un `ServiceProviderProfile` est user-scopé et collabore avec N agences via
`service_provider_agency_collaborations`. Un `agency_role_id` unique y désignerait le rôle d'UNE
agence pour un profil qui en sert plusieurs — ce qui contredit le principe 2 (« l'agence est la
frontière d'isolation »).

Rien n'a été inventé pour compenser. Le rôle système `service_provider` **est** seedé dans chaque
agence (AC1 tenu à la lettre, il sert de catalogue à l'UI), et la branche `service_provider` du
résolveur reste sur la table de vérité phase 1 — qui est **la même source** que ce rôle système
(`SystemRoleCapabilities`), donc les deux chemins donnent le même verdict par défaut. Un prestataire
ne peut simplement pas encore recevoir un rôle *personnalisé*.

**La décision demande un ADR** : soit le rôle est porté par la collaboration
(`service_provider_agency_collaborations.agency_role_id`, ce qui est le couple *(prestataire,
agence)* et donc le bon porteur), soit le profil devient agence-scopé. La seconde option casse
l'unicité de `user_id` et la surface `/app/maintenance/providers`. Ni le ticket ni la spec ne
tranchent.

### ⑶ L'enum `UserRole` n'a pas été supprimée

Le delta le demande, mais son propre docblock (écrit en TCK-278) explique qu'elle survit comme
**vocabulaire de contrat HTTP** pour `PUT /api/users/{user}/role` (`Api\UserRoleController`), que
TCK-279 ne remplace pas : `PATCH /profiles/{p}/agency-role` réaffecte un `AgencyRole`, il ne crée ni
ne détruit de profil. La supprimer casserait cet endpoint et le sélecteur frontend qui le consomme —
c'est-à-dire du travail frontend, hors de cette passe. **À faire dans la passe front, ou dans un
ticket dédié.**

### ⑷ `PATCH /profiles/{profile}/agency-role` prend un `profile_type` dans le corps

L'URL du ticket suppose qu'un id désigne un profil. Les profils sont polymorphes : l'id 12 existe
dans les trois tables à la fois. `routes/api/profiles.php` avait déjà tranché en liant explicitement
`{agent_profile}`. On garde l'URL du ticket et on désambiguïse par le corps (`profile_type`, valeur
d'`AgencyRoleBaseType`) plutôt que de changer le contrat en `{profile_type}/{id}`.

### ⑸ Le pointeur NOT NULL est posé par défaut, pas exigé de chaque site de création

`agency_role_id` est NOT NULL (Règle 6) et ~40 sites créent des profils. Plutôt que de les retoucher
un par un — et de découvrir l'oubli en production sur une contrainte violée — `HasAgencyRole::
bootHasAgencyRole()` pose le **rôle système du type dans l'agence du profil** quand rien n'est
déclaré. C'est exactement ce que prescrit la Règle 6 (« tout profil créé reçoit par défaut le
AgencyRole système de son type »). Conséquence visible : les tests qui insèrent en SQL brut
(`ProfileSchemaTest`) doivent nommer le rôle eux-mêmes — ce que la contrainte est censée forcer.

### ⑹ Contrainte « un seul rôle système par (agency_id, base_profile_type) » : applicative

La spec la décrit comme un unique **partiel** (`WHERE is_system = true`), que MySQL 8.0 ne sait pas
exprimer. Elle est tenue par `AgencySystemRoleSeeder` (idempotent) et par le fait qu'aucun chemin
d'API ne crée de rôle `is_system=true`. L'unique `(agency_id, name)` en couvre l'effet visible.

### ⑺ Aucune capacité n'a été ajoutée au catalogue

Il n'existe pas de `roles.view`. La lecture est gardée par `Capability::TeamAssignRole` — qui est
exactement la raison métier de consulter la liste des rôles. Ajouter un 45ᵉ cas aurait cassé
`MembershipCapabilityResolverTest::agency_admin_breadth_is_pinned_to_42_of_44` pour un gain nul.

### Vérifications faites

- Suite backend complète : **2356 passés, 0 échec, 2 skipped** (172 s, machine chargée par d'autres
  agents). Les 38 tests de `MembershipCapabilityResolverTest` (TCK-278) passent **sans une seule
  retouche** — c'est la preuve la plus forte que le refactor a préservé la sémantique phase 1, et
  que le nouveau chemin (pivot) est bien celui qui répond : il n'y a aucun repli pour
  agent/admin/owner.
- **Signature publique du résolveur** : vérifiée par réflexion dans
  `MembershipCapabilityResolverCacheTest`, et par `grep` — 21 sites d'appel de `canActAt(`,
  `HasProfiles.php` inchangé (diff vide).
- **MySQL 8.0** (conteneur `takussan-mysql-1`, `utf8mb4_0900_ai_ci`) : aller complet, rollback des
  8 migrations au-dessus de la borne TCK-278, re-migration. Puis **backfill sur données réelles** —
  2 agences, 6 profils dont un soft-deleté et un draft `user_id NULL` : 4 rôles/agence, capacités
  42/18/1/2 conformes à la table phase 1, **0 orphelin**, 0 incohérence d'agence, NOT NULL effectif
  sur les 3 tables. Rollback avec données : profils préservés, tables de rôles droppées.
- **Ablations** (chaque garde vue rougir sans son correctif) : observer de seed retiré → 2 échecs ;
  garde « last admin » retirée → 3 échecs ; purge du cache après sync retirée → 2 échecs ; hook
  `saved` retiré → 1 échec ; garde `is_system` de `AgencyRolePolicy@update` retirée → 2 échecs.
- Garde CI `Spatie\Permission\` : **elle a rougi sur mon propre docblock**, qui citait le namespace
  en prose. Reformulé. `./vendor/bin/pint` passe.

### ⑻ AC12 : sa portée réelle est PLUS ÉTROITE que son énoncé, et c'est mesuré

L'AC dit « remplacer les `isAgencyAdmin(user.roles)` qui contrôlent une feature
granulaire ». **Il n'y en avait aucun.** Les cinq appels d'`isAgencyAdmin` du dépôt,
relevés par `grep`, sont tous des gardes de NAVIGATION ou d'APPARTENANCE :
`app/page.tsx` et `onboarding/agency-admin/page.tsx` (redirections, dans des
composants SERVEUR où aucun hook ne peut vivre), `AppShell.tsx` et
`useAgencyStandardWelcomeOnce.ts` (éligibilité de l'assistant de bienvenue), plus le
docblock d'`useCan`. Le docblock d'`useCan` prescrit lui-même de les laisser :
« les gardes de NAVIGATION gardent `isAdmin` : elles portent sur l'appartenance, pas
sur un verbe ».

Les gates réellement granulaires étaient ailleurs, sous `isAdmin` : `BookingDetail`
(`isDashboardAgent` → Accepter / Refuser / Annuler / Enregistrer un paiement). Ce sont
celles-là qui passent aux capacités (`bookings.validate`, `bookings.cancel`,
`payments.record`), plus les gestes neufs de `/admin/roles` (`roles.create_custom`,
`roles.edit_custom`, `roles.delete_custom`) et le sélecteur de la console Équipe
(`team.assign_role`).

**Un cas granulaire reste NON converti, et délibérément** : `VisitDetail.tsx`
(`isManager` → confirmer / annuler / terminer / replanifier une visite). Le catalogue
`Capability` n'a **aucun domaine `visits.*`** — il n'existe pas de capacité à
interroger. Le convertir demanderait d'élargir l'enum, ce que la note ⑺ refuse pour ce
ticket. À ticketer si le besoin se confirme.

*L'énoncé d'un AC décrit une intention ; le `grep` décrit le dépôt. Quand les deux
divergent, écrire la divergence vaut mieux que de cocher la case.*

### ⑼ Une pièce backend manquait encore : `GET /api/agencies/{agency}/role-assignments`

La colonne « Rôle » de la console Équipe et son sélecteur ont besoin du couple
`(profile_id, profile_type)` et du nom du rôle. **Rien ne les exposait** :
`AgencyController::listMembers` liste des `User`, et — mesuré sur l'API en marche, pas
déduit — `/api/users` rend les attributs Eloquent BRUTS, sans même la clé `roles` de
`UserResource`. La colonne « Rôle » de cet écran affichait donc « — » pour tout le
monde **avant** ce ticket ; ce n'est pas une régression introduite ici, c'est un vide
que le nouvel endpoint comble.

`UserResource` ne pouvait pas porter l'information : il faudrait choisir, pour tout le
produit, lequel des N profils d'un utilisateur est « le » profil. Rapportée à une
agence, la question a une réponse — d'où un endpoint distinct, scopé, avec
`user_ids` **requis** (borné par construction : pas de troncature silencieuse qui
afficherait « — » à des membres qui ont bien un rôle).

⚠️ `user_ids` se lit en **liste à virgules** (`?user_ids=3,7`), pas en `user_ids[]=`.
C'est la seule forme que produit `buildQueryString` (échappatoire `extra`,
`String(value)`). Sans le découpage côté contrôleur, la règle `array` refuserait en 422
**tous** les appels du front — vérifié par ablation : le test en `user_ids[]` reste
vert, seul `test_it_accepts_the_comma_separated_form_the_frontend_sends` rougit.

### ⑽ Vérification en navigateur (2026-08-17)

Les AC d'UI ne se prouvent pas au typage. Pile isolée montée pour l'occasion — SQLite
dédié, API sur 8012, front sur 3010 — pour ne pas toucher aux données de
développement partagées. Parcours joué de bout en bout :

1. `/admin/roles` : les 4 rôles système groupés par type, badge « Système », **pas de
   bouton Supprimer** sur eux, matrice en lecture seule ;
2. « **42 sur 42** capacités accordées » sur l'administrateur — le dénominateur exclut
   bien les 2 réservées plateforme sur 44 ; `properties.moderate` et
   `reports.view_global` sont grisées, décochées, badgées ;
3. clone d'`Agent` → « Agent senior » (18/42 hérités), ajout de
   `properties.update_any`, « Enregistrer » → « Modifications enregistrées », 19/42 ;
4. console Équipe : la colonne « Rôle » affiche « Administrateur » et « Agent » (elle
   affichait « — » avant, cf. ⑼) ; sélecteur du profil d'Awa Diop → « Agent senior » →
   « Attribuer ». **Vérifié en base** : `agent_profiles.agency_role_id` pointe sur
   « Agent senior », 19 capacités ;
5. suppression d'« Agent senior » → **409** : le dialogue devient « Ce rôle est encore
   attribué », nomme « Awa Diop », et le bouton Supprimer disparaît.

Deux constats de cette session, **hors périmètre de ce ticket** :

- `next dev` **bloque les ressources de développement cross-origin depuis
  `127.0.0.1`** (`allowedDevOrigins`). Or `takussan-web/.env.local` pointe le front sur
  `127.0.0.1`. Servi sur cet hôte, l'application **ne s'hydrate pas** : les formulaires
  se soumettent en GET natif. C'est probablement la vraie cause de l'incohérence d'hôte
  déjà signalée dans `takussan-web/CLAUDE.md` (« du point de vue des cookies,
  `localhost` et `127.0.0.1` sont deux origines distinctes »).
- La barre supérieure affiche « **undefined · Agence Teranga** ». Antérieur à ce
  ticket, aucun rapport avec les rôles.

### Reste à faire côté backend

- La décision `service_provider` (⑵) — ADR requis avant code.
- La suppression de `UserRole` (⑶). **Toujours pas faite, et toujours pour la même
  raison** : `UserRolesEditor` (`PUT /api/users/{user}/role`) est un mécanisme
  DISTINCT de `PATCH /profiles/{p}/agency-role` — le premier crée ou archive un
  profil, le second réaffecte un rôle. Les deux coexistent désormais dans le tiroir de
  membre, l'un sous « Rôle », l'autre sous « Rôle dans cette agence ». Les fusionner
  est un travail de conception, pas de nettoyage : ticket dédié.

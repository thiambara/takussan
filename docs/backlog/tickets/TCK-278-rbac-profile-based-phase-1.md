---
id: TCK-278
title: "RBAC refondu — phase 1 : suppression de spatie sur User + PlatformProfile + Capability resolver"
status: review
phase: P1
family: technique
estimate: XL
wave: 34
created: 2026-05-17
updated: 2026-08-15
execution_strategy: phased-on-branch (P1 foundations coexist with spatie → P2 callsite refactor → P3 cutover/drop)
depends_on: []
blocks: [TCK-279]
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#1-user
    - docs/models-spec.md#51-platformprofile-
    - docs/models-spec.md#règle-5--profil--rôle
    - docs/models-spec.md#spatielaravel-permission
tags: [back, security, rbac, refactor, p1, architecture]
---

## Objectif utilisateur

Aucun changement visible côté utilisateur final. Refactor d'invariants internes : éliminer la double-source-de-vérité (rôle spatie sur User **ET** profil polymorphe) qui a causé plusieurs bugs (cf. note TCK-277), au profit d'un modèle unique « le profil est le rôle ». Pré-requis pour débloquer les rôles personnalisés (TCK-279, ex-TCK-135).

## Contrat de données

Aucun nouvel endpoint exposé. Le contrat API reste stable.

**Modèle ajouté** : `PlatformProfile` (cf. spec §51).

**Modèles retouchés** :
- `User` : retrait du trait `HasRoles`, ajout des relations `platform_profile()` + `agency_admin_profiles()` (déjà partiellement présent depuis TCK-271, à harmoniser), enrichissement de `HasProfiles` avec `canActAt(Capability, ?Agency)`, `isSuperAdmin()`, `isAgencyAdminAt()`, `isAgentAt()`, `isOwnerAt()`, `hasProfileAt(Agency, string $profileType)`.
- Tables spatie supprimées : `roles`, `permissions`, `model_has_roles`, `model_has_permissions`, `role_has_permissions`.

**Modèle de résolution** :
- Enum PHP `App\Models\Enums\Capability` (catalogue ≈ 30–50 entrées, cf. spec).
- Service `App\Services\Membership\MembershipCapabilityResolver` avec `allows(User, Capability, ?Agency): bool`. En phase 1, la résolution est une table de vérité code-defined `(Capability, ProfileType) → bool`. En phase 2 (TCK-279), elle consultera le pivot `agency_role_capabilities`. **Signature stable entre les deux phases.**

## Contraintes strictes (métier)

- **Aucune régression d'autorisation observable** : les Policies, middlewares, contrôleurs doivent appliquer le même verrou qu'avant. La table de vérité phase 1 reproduit le mapping actuel rôle spatie → permissions.
- **Aucun usage résiduel de `hasRole()`, `assignRole()`, `removeRole()`, `syncRoles()`, `setPermissionsTeamId()`, `Spatie\Permission\*`** ne doit subsister dans `app/` après la PR. Le linter doit empêcher leur réintroduction (règle CI, voir Delta).
- **Création du premier `super_admin`** : via seeder bootstrap ou commande artisan (`php artisan platform:grant-super-admin {email}`).
- **Migration des données existantes** : pour chaque user actuel ayant le rôle spatie `super_admin`, créer un `PlatformProfile(level: super_admin, granted_at: now())`. Pour les autres rôles (`agency_admin`, `agent`, `owner`, `service_provider`), aucune action — l'existence des profils correspondants est déjà la source de vérité visée. Vérifier la cohérence par un audit script (« tout user ayant le rôle spatie `agency_admin` a-t-il bien un `AgencyAdminProfile` ? ») et corriger les éventuels orphelins via seed.
- **Pas de fallback rétro-compat** : après cutover, plus aucune lecture des tables spatie. La compat se gère via une **fenêtre de migration** (déploiement, migration data, suppression des tables) cadrée dans la PR.
- **`PlatformProfile.level` de niveau `super_admin`** : seul un super_admin actif peut en créer/révoquer un autre. La table doit avoir une contrainte unique sur `user_id`.
- **Token revocation** : la révocation d'un `PlatformProfile` (`revoked_at = now()`) doit déclencher `tokens()->delete()` du user (via Observer) pour invalider les sessions.

## Delta à produire

### Backend

- [ ] Migration : `create_platform_profiles_table` (cf. spec §51).
- [ ] Migration : `drop_spatie_permission_tables` (à exécuter en dernier, après backfill).
- [ ] Migration de données : `backfill_platform_profiles_from_spatie_super_admin` (commande artisan idempotente exécutée en pre-deploy).
- [ ] Model : `App\Models\Profiles\PlatformProfile` (étend `AbstractModel`, enum `PlatformProfileLevel`, scopes `active()`, observer `tokens()->delete()` sur `revoked_at` set).
- [ ] Enum : `App\Models\Enums\PlatformProfileLevel` (`super_admin`, `support`, `viewer`).
- [ ] Enum : `App\Models\Enums\Capability` (catalogue initial — démarrer par les capacités effectivement check'ées par les Policies actuelles, étendre au fil de l'eau).
- [ ] Service : `App\Services\Membership\MembershipCapabilityResolver` (table de vérité phase 1 : `match` exhaustif `(Capability, ProfileType) → bool`).
- [ ] Trait `HasProfiles` enrichi : `canActAt(Capability, ?Agency): bool`, `isSuperAdmin(): bool`, `isAgencyAdminAt(int): bool` (existe déjà après TCK-277, conserver), `hasProfileAt(int $agencyId, string $profileType): bool`, `platformProfile(): HasOne`.
- [ ] Refactor systématique :
  - Tout `$user->hasRole('xxx')` → `$user->isXxxAt($agency)` ou `$user->canActAt(Capability::Yyy, $agency)`.
  - Tout `$user->assignRole(...)` / `syncRoles(...)` → création/suppression du profil correspondant (transaction).
  - Tout `setPermissionsTeamId(...)` → supprimé.
  - `UserAdminController::index` : la scope agence-admin (déjà patché TCK-277) reste, mais le `filter[role]` doit basculer sur un check par présence de profil au lieu de spatie `whereHas('roles')`.
  - `UserRoleController` : transformé en `MembershipController` qui crée/archive des profils dans une transaction au lieu de `syncRoles()`. Endpoint inchangé (`PUT /api/users/{id}/role` → renomme l'action ChangeMembership).
  - `Policies/*Policy.php` : remplacer toutes les vérifications de rôle par `$user->canActAt(...)`.
  - `Http/Middleware/ResolveActiveProfile` : retirer l'appel à `setPermissionsTeamId`.
  - `database/seeders/RolesAndPermissionsSeeder.php` : supprimé. Remplacé par `PlatformBootstrapSeeder` qui crée un super_admin initial si aucun n'existe.
  - `BaseTestCase::actingAsRole($role, …)` : refactor pour créer le bon profil au lieu d'assigner un rôle spatie. Cf. fixtures § ci-dessous.
- [ ] Tests :
  - Tests existants — adapter les fixtures (`actingAsRole`, factories) au nouveau modèle. Toute la suite doit rester verte sans changement de sémantique fonctionnelle.
  - Nouveau test `PlatformProfileTest` : création / révocation / contrainte unique `user_id` / observer tokens().
  - Nouveau test `MembershipCapabilityResolverTest` : pour chaque (Capability, ProfileType) attendu, vérifier le résultat.
  - Nouveau test `RbacRegressionTest` : pour chaque endpoint sensible (block user, change role, list users, publish property, etc.), vérifier que les acteurs autorisés/refusés restent identiques pré/post refacto.
- [ ] CI : ajouter un check qui refuse les imports `Spatie\\Permission\\` dans `app/` (regex grep dans `phpstan.neon`, `pint.json` custom rule, ou simple bash script lancé en CI).

### Frontend

- [ ] `User.roles[]` dans `src/types/user.ts` : remplacer par `User.profile_types[]` (string array dérivée côté backend dans la `UserResource`) ; tous les checks frontend (`isAdmin(user.roles)`, `isAgencyAdmin(user.roles)`, etc.) basculent sur `profile_types`.
- [ ] Helpers `src/lib/roles.ts` : `isAdmin`, `isAgencyAdmin`, `isSuperAdmin`, `isAgent`, `isOwner` consomment désormais `profile_types` (ou un nouveau champ `User.capabilities` si on expose le résultat du resolver côté API).
- [ ] Si exposition des capabilities côté frontend : nouveau hook `useCan(Capability)` qui consulte une matrice servie au login (`/api/me/capabilities` ou inclusion dans `/api/me`).
- [ ] Aucune route frontend déplacée ni renommée.

### Hors backend / frontend

- [ ] Mise à jour `CLAUDE.md` (section sur spatie si elle existe) pour acter la suppression.
- [ ] Mise à jour `README` côté backend si une mention de spatie/permission y apparaît.

## Critères d'acceptation

- [ ] AC1 — `grep -r "Spatie\\\\Permission" takussan-api/app` retourne 0 résultat.
- [ ] AC2 — `grep -r "hasRole(\\|assignRole(\\|syncRoles(\\|removeRole(" takussan-api/app` retourne 0 résultat.
- [ ] AC3 — Les tables `roles`, `permissions`, `model_has_roles`, `model_has_permissions`, `role_has_permissions` n'existent plus après migration.
- [ ] AC4 — `php artisan test` : 100 % de la suite verte, sans aucun test désactivé.
- [ ] AC5 — Le premier `super_admin` peut être créé via `php artisan platform:grant-super-admin {email}` ; le check `User::isSuperAdmin()` renvoie `true` ensuite.
- [ ] AC6 — Backfill : avant la migration `drop_spatie_permission_tables`, chaque user qui avait le rôle spatie `super_admin` a désormais un `PlatformProfile.level = super_admin` actif.
- [ ] AC7 — `UserAdminController::index?filter[role]=agency_admin` retourne les users ayant un `AgencyAdminProfile` actif dans l'agence active, sans dépendre des tables spatie.
- [ ] AC8 — `UserAdminController::block` / `activate` / `change-role` (ex-UserRoleController) restent fonctionnels avec les mêmes garanties de scoping (tests `UserAdminAgencyScopeTest` toujours verts, plus nouveaux tests).
- [ ] AC9 — Le frontend admin (TeamConsole, sidebar, gates pro-features) continue à fonctionner identiquement.
- [ ] AC10 — CI bloque toute future réintroduction d'un import `Spatie\\Permission\\` dans `app/`.

## Hors périmètre

- L'ajout du trait `HasRoles` sur les profils et la création des tables `agency_roles` / `agency_role_capabilities` → **TCK-279**.
- L'UI de gestion des rôles personnalisés (`/admin/roles`) → **TCK-279** (rebase de TCK-135).
- Profile-isation de `customer` et `tenant` (création de `CustomerProfile` / `TenantProfile`) → ticket séparé si besoin émerge.
- Modification de l'algorithme de résolution de profil actif (`ResolveActiveProfile` middleware) — on retire juste l'appel spatie, on ne touche pas à la résolution elle-même.
- Suppression de l'enum `UserRole` côté backend : marquée `@deprecated` en TCK-278, suppression effective en TCK-279 ou ticket de nettoyage ultérieur.

## Notes d'implémentation

_(à remplir par implementing-specs)_

## Reste sur dev

_Réécrit le 2026-08-15. **La version précédente de cette section était fausse sur ses trois
affirmations frontend** — elle listait comme « restant à faire » des fichiers que la PR #144
(`33ce4f69`) avait elle-même supprimés. Un agent qui l'aurait appliquée à la lettre serait allé
rapporter ces deltas depuis la branche `feat/tck-278-279-rbac-architecture-spec` et aurait
**ressuscité du code mort**. Elle avait été déduite de la branche, pas mesurée sur `dev`._

**Ce qui EST sur `dev`** — le socle backend, entré par la PR #144 (`33ce4f69`), complété par
`47cbc365` :

- `spatie/laravel-permission` **désinstallé** — absent de `composer.json`, de `composer.lock` et de
  `vendor/` ; zéro import `Spatie\Permission\`, zéro `hasRole()/assignRole()/syncRoles()/removeRole()`
  dans `app/` ; les 5 tables droppées ;
- `app/Models/Enums/Capability.php` (44 cas), `app/Models/Profiles/PlatformProfile.php`,
  `app/Models/Enums/PlatformProfileLevel.php`, `app/Observers/PlatformProfileObserver.php`,
  `app/Services/Membership/MembershipCapabilityResolver.php` ;
- le resolver est **réellement dans le chemin d'autorisation de production** : une `Gate::define()`
  par capacité (`AppServiceProvider.php:415-442`), atteinte par 6 sites d'appel (LeasePolicy ×5,
  RentReviewService ×1) ;
- les tests associés et `BasePolicyTest` mis à jour ;
- la **garde CI** qui casse sur tout import `Spatie\Permission\` (`.github/workflows/api-ci.yml`).

**Ce qui a été corrigé le 2026-08-15** — quatre deltas RÉELS, qu'aucune des trois affirmations
précédentes ne mentionnait, et que la suite verte ne pouvait pas voir :

1. **Régression d'autorisation en production.** `MediaPolicy::viewRaw` testait
   `$user->can('properties.update')` — une chaîne qui n'est **aucun** cas de `Capability` (il n'y a
   que `update_any` et `update_own`). Aucune Gate n'était définie pour elle, et une ability non
   définie ne lève pas : elle refuse. Tout `agency_admin` qui n'est pas le `primary_admin_id` de son
   agence avait perdu l'accès au média original non-filigrané, alors que le rôle spatie
   `agency_admin` portait bien `properties.update` avant le cutover. Corrigé en
   `canActAt(Capability::PropertiesUpdateAny, $agency)` ; le test manquant est posé.
2. **400 mesuré côté front.** `fetchAdminAgencyTeam` envoyait `include=roles` sur un endpoint monté
   sur `buildQuery` → `InvalidIncludeQuery`, HTTP 400, panneau équipe super-admin vide. Le payload
   contenait déjà `roles`. Retiré, ici et sur `fetchAdminUserDetail` (mort mais inoffensif), avec
   une garde côté appelant.
3. **Écart avec le mapping spatie, documenté ET rendu exécutable.** La contrainte stricte disait
   « la table de vérité phase 1 reproduit le mapping rôle spatie → permissions ». Elle ne le
   reproduit pas : `owner` perd 7 capacités sous nom identique, `agent` en gagne 5, `agency_admin`
   en gagne 7 et fonctionne par liste NOIRE de 2 là où le rôle spatie était une liste blanche. Le
   diff sourcé est en commentaire dans le resolver, et chaque capacité retirée ou ajoutée a son cas
   de test. **C'est le point le plus important pour TCK-279**, qui va seeder cette table en base
   pour chaque agence : un élargissement gravé en donnée ne se rattrape pas par un correctif de code.
4. **Trois valeurs mortes dans le sélecteur de rôle frontend** (`tenant`, `customer`,
   `service_provider`) : acceptées en validation, puis no-op silencieux côté backend (200, aucune
   mutation). Retirées.

Sont également soldés : le docblock de la migration de cutover (il annonçait en pré-requis une
commande `platform:backfill-from-spatie` qui n'a jamais existé), les 14+ docblocks de la dette D-21,
et l'enum `UserRole` marquée `@deprecated`.

**AC6 est sans objet, pas non tenu.** Le backfill visait des données spatie de production ; la
production n'a jamais été déployée (D-04 / TCK-288). Il n'y a rien à reprendre.

**La branche `feat/tck-278-279-rbac-architecture-spec` est abandonnée.** 9 commits d'avance,
**85 de retard** sur `dev`, et ses trois deltas frontend annoncés sont déjà sur `dev` — supprimés
par la PR #144 elle-même. Elle n'a plus rien à apporter ; la re-fonder coûterait plus que de
repartir de `dev`, ce qui est ce qui a été fait.

> Ce ticket passe `review` **et non `done`** parce qu'un statut vaut pour ce qui est mergé sur `dev`
> (règle n°3) et que les correctifs ci-dessus ne le sont pas encore. Il passe `done` — et débloque
> TCK-279 — à leur merge.

## Ce que ce ticket a appris

**2056 tests verts ne prouvent pas l'absence de régression d'autorisation.** La suite entière était
verte alors que trois défauts vivaient sur `dev` : un retrait d'accès silencieux, un 400 sur un
panneau admin, et un no-op qui affichait un succès. Elle n'a rien vu pour deux raisons qui se
ressemblent — le test backend d'`AgencyDetailTest` avait été « corrigé » en **retirant**
`include=roles` de la requête (désarmer la garde plutôt que la poser), et `MediaPolicyTest`
couvrait le super_admin, le `primary_admin` et un admin d'une autre agence, c'est-à-dire tout sauf
le seul cas qui dépendait de la capacité.

*Une suite verte mesure ce qu'on a pensé à lui demander. Sur une refonte d'autorisation, ce qu'on
n'a pas pensé à demander est exactement ce qui casse.*

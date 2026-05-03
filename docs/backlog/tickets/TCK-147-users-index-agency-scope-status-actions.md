---
id: TCK-147
title: "Backend — `/api/users` agency-scoped + block/activate ouverts à `agency_admin`"
status: review
phase: P1
family: back
estimate: S
created: 2026-05-03
updated: 2026-05-03
depends_on: [TCK-141, TCK-142]
blocks: [TCK-133]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#1-user
    - docs/models-spec.md#2-agency
tags: [back, admin, users, p1]
---

## Objectif utilisateur

Un `agency_admin` peut, depuis le futur écran `/admin/users` (TCK-133),
lister les comptes ayant un lien actif avec son agence courante et
activer / bloquer un compte de **son** agence sans recourir à un
`super_admin`.

## Contrat de données

Endpoints concernés (modifications) :

- `GET /api/users` — `UserAdminController::index`
  - Aujourd'hui : `abort_unless hasRole(['admin','super_admin'])`, aucun
    scope agence.
  - Après : autoriser `agency_admin`. Pour `agency_admin` (et tout
    acteur non `super_admin`/`admin`), filtrer automatiquement sur les
    users qui ont **un profil actif** (`agentProfiles` ∪
    `ownerProfiles`) dans l'agence du **profil actif** (résolu par
    `ResolveActiveProfile`, TCK-141). `super_admin` / `admin` gardent
    la portée globale.
  - Les filtres / sorts existants (`filter[search]`, `filter[status]`,
    sparse `fields[users]=…`) restent inchangés. Ajouter
    `AllowedFilter::callback('role', …)` sur `User::$requestFilterable`
    via la même logique que `AgencyController::listMembers` (post-filter
    `whereHas('roles', fn(...) => ->where('name', $role))`) pour
    permettre `filter[role]=agent`.
  - Nouveau : whitelist `agentProfiles`, `ownerProfiles`, `roles` dans
    `User::$requestLoadable` afin que le frontend puisse demander
    `include=agentProfiles,ownerProfiles,roles` et afficher les rôles
    et l'appartenance par agence.

- `POST /api/users/{user}/block` — `UserAdminController::block`
- `POST /api/users/{user}/activate` — `UserAdminController::activate`
  - Aujourd'hui : réservés à `admin`/`super_admin`.
  - Après : autoriser également `agency_admin`, **uniquement** si la
    cible a un profil (agent **ou** owner) dans l'agence active de
    l'acteur (mêmes helpers `isAgentAt($agencyId)` /
    `isOwnerAt($agencyId)` que `UserRoleController`).
  - Comportement inchangé : `block` révoque les Sanctum tokens et écrit
    un `ActivityLog` (déjà géré par `LogsActivity` + `tokens()->delete()`).
  - Erreur 422 explicite si la cible n'a pas de profil dans l'agence
    courante : message `messages.target_user_not_in_active_agency`
    (clé à ajouter en FR/EN/WO).

- `PUT /api/users/{user}/role` — `UserRoleController::update`
  - Aujourd'hui : abort 403 sans message lorsque la cible n'a pas de
    profil dans l'agence de l'acteur.
  - Après : conserver le 403 pour les non-`super_admin` mais renvoyer
    explicitement `messages.target_user_not_in_active_agency` (même
    clé que ci-dessus) pour permettre au frontend d'afficher un message
    d'erreur clair.

Modèle `User` :

- `protected static array $requestFilterable = ['status', 'added_by_id'];`
  → ajouter `role` via `AllowedFilter::callback` (déjà patron dans
  `HasQueryBuilder` ? sinon, inline dans le contrôleur comme
  `AgencyController::listMembers`).
- `protected static array $requestLoadable = [];` → `['agentProfiles',
  'ownerProfiles', 'roles']`.

## Contraintes strictes (métier)

- Aucun changement n'élargit la portée d'un `agency_admin` au-delà de
  son agence active (jamais de cross-tenant). La résolution passe
  systématiquement par `request()->activeProfile()->agency_id`.
- Un `agency_admin` ne peut pas se bloquer lui-même (`cannot_block_self`
  reste actif).
- `super_admin` et `admin` (rôles globaux, `team_id = null`) gardent la
  portée globale exactement comme aujourd'hui — aucune régression
  visible côté `/super-admin/users` (TCK-145).
- Les `ActivityLog` automatiques (Spatie ActivityLog + `LogsActivity`)
  doivent enregistrer l'action et le causer (`agency_admin` ou
  `super_admin`).
- `block` doit toujours révoquer 100 % des tokens Sanctum de la cible
  avant de retourner.

## Delta à produire

- [ ] Migration : aucune (les changements sont au niveau contrôleur /
      modèle / lang).
- [ ] Modèle `app/Models/User.php` :
      - [ ] Ajouter `agentProfiles`, `ownerProfiles`, `roles` à
            `$requestLoadable`.
      - [ ] Ajouter le filtre `role` (via callback ou via une nouvelle
            propriété `$requestFilterableCallbacks` adoptée par
            `HasQueryBuilder` si elle n'existe pas — sinon inline dans
            le contrôleur).
- [ ] Controller `app/Http/Controllers/Api/UserAdminController.php` :
      - [ ] `index()` : autoriser `agency_admin`. Pour les non-globaux,
            appliquer `whereHas('agentProfiles'|'ownerProfiles', ...)`
            sur `request()->activeProfile()->agency_id` avant
            `User::buildQuery()`. Pour les globaux, comportement
            inchangé.
      - [ ] `block()` / `activate()` : autoriser `agency_admin` si
            `$user->isAgentAt($agencyActif) || isOwnerAt(...)` ; sinon
            422 `target_user_not_in_active_agency`.
- [ ] Controller `app/Http/Controllers/Api/UserRoleController.php` :
      - [ ] Remplacer `abort(403)` (cible hors agence) par
            `abort(403, __('messages.target_user_not_in_active_agency'))`.
- [ ] Lang : ajouter la clé
      `target_user_not_in_active_agency` dans
      `lang/fr/messages.php`, `lang/en/messages.php`,
      `lang/wo/messages.php`.
- [ ] Tests `tests/Feature/Admin/UserAdminControllerTest.php` (nouveau
      ou enrichi) :
      - [ ] `agency_admin` voit uniquement les users de son agence
            active (owner + agent).
      - [ ] `agency_admin` peut filtrer par `filter[role]=agent`.
      - [ ] `super_admin` garde la portée globale.
      - [ ] `agency_admin` peut bloquer un agent de son agence.
      - [ ] `agency_admin` ne peut pas bloquer un user d'une autre
            agence (422 + clé message).
      - [ ] `agency_admin` ne peut pas se bloquer lui-même (422
            `cannot_block_self`).
      - [ ] `super_admin` peut toujours bloquer n'importe quel user.
- [ ] Tests `tests/Feature/Admin/UserRoleControllerTest.php` :
      - [ ] Cible hors agence : 403 + clé
            `target_user_not_in_active_agency`.

## Critères d'acceptation

- [ ] `GET /api/users` répond 200 pour un `agency_admin` et liste
      uniquement les users avec un profil agent ou owner dans son
      agence active.
- [ ] `GET /api/users?filter[role]=agent` filtre correctement (test
      vert) sans casser le scope agence.
- [ ] `GET /api/users` reste cross-tenant pour `super_admin` /
      `admin`.
- [ ] `POST /api/users/{id}/block` répond 200 quand un `agency_admin`
      cible un user de son agence ; 422 (clé
      `target_user_not_in_active_agency`) sinon.
- [ ] `POST /api/users/{id}/activate` suit la même règle.
- [ ] `PUT /api/users/{id}/role` renvoie une erreur **avec** la clé
      `target_user_not_in_active_agency` quand la cible n'est pas
      dans l'agence active du caller (au lieu d'un 403 vide).
- [ ] Tous les tests `php artisan test --filter=UserAdmin\\|UserRole`
      passent.
- [ ] `./vendor/bin/pint` passe sans diff.

## Hors périmètre

- Frontend `/admin/users` (livré par TCK-133 une fois ce ticket vert).
- Inclusion des `Customer` dans la liste (relation `customers` n'a pas
  de profil ; un ticket dédié peut compléter plus tard).
- Suppression de compte (RGPD) — couvert par un P2 dédié.
- Modification du payload des actions block/activate (rester sur la
  forme actuelle `{ id, status }`).

## Notes d'implémentation

- **Filtre `role` via le hook `customQueryFilters()`** : Spatie rejette tout
  `?filter[role]=…` non whitelisté avec **HTTP 400 / `InvalidFilterQuery`** —
  un post-filtre dans le contrôleur ne suffit pas. Première approche tentée :
  `protected static function getAllowedQueryFilters()` qui appelait
  `parent::getAllowedQueryFilters()`. Échec : la méthode est déclarée sur le
  trait `HasQueryBuilder` (pas sur la classe parente Eloquent\Model), donc
  `parent::` ne la résout pas, retombe sur `__callStatic`, et boucle
  infiniment (xdebug coupe à 512 frames). Solution livrée : ajout d'un point
  d'extension `customQueryFilters()` dans le trait, que `User` surcharge pour
  exposer un `AllowedFilter::callback('role', whereHas('roles', name=…))`.
  Réutilisable pour d'autres modèles ayant des filtres non-colonne.
- **`team_id = null` pour les admins globaux** : `ResolveActiveProfile` pin
  `team_id = null` quand l'acteur tient `super_admin` ou `admin` (probe sous
  team_id=null d'abord). Donc dans `UserAdminController::index`, le test
  `! $actor->hasRole(['admin', 'super_admin'])` distingue correctement les
  agency_admin (team_id = leur agence active) des admins globaux. Aucune
  régression sur `/super-admin/users` (qui passe par le proxy
  `/api/super-admin-users` → `/api/users`, en super_admin).
- **Distinction `target_user_has_no_active_agency` vs `target_user_not_in_active_agency`** :
  la première (préexistante) couvre « la cible n'a aucun contexte d'agence
  résolvable » (super_admin tente d'attribuer un rôle agence à un user sans
  profil). La seconde, ajoutée ici, couvre « l'acteur agency_admin a une
  agence active mais la cible n'y est pas ». Les deux clés sont distinctes
  pour permettre au front de proposer des CTA différents (« créer un profil
  pour cet utilisateur » vs « inviter cet utilisateur dans votre agence »).
- **Pas de support `Customer`** : la liste retourne uniquement les users
  ayant un `AgentProfile` ou un `OwnerProfile` dans l'agence active.
  Les locataires *via la relation `Customer`* (mentionnés dans TCK-133) ne
  sont pas inclus — un ticket dédié pourra étendre le scope si l'usage
  /admin/users le justifie.
- **Pas de migration, pas de modification du payload** des actions
  block/activate. Les `ActivityLog` continuent d'être écrits par le trait
  `LogsActivity` du modèle User.
- **Tests** : 10 nouveaux scénarios dans
  `tests/Feature/Api/UserAdminAgencyScopeTest.php`. Les tests existants de
  `UserAdminTest` et `UserRoleControllerTest` restent verts (39 / 39).
  Suite complète : 1574 passed.

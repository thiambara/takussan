# ADR-0047 — Un opérateur plateforme agit par `/api/admin` selon son niveau ; toute route qui ne déclare rien reste au `super_admin`

- **Statut** : Accepté
- **Date** : 2026-10-08
- **Tickets** : [TCK-600](../backlog/tickets/TCK-600-console-plateforme-gouvernance-et-exploitation.md)
- **Précise** : [ADR-0031](0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md) (`Capability`
  reste le vocabulaire **d'agence** et la garde de TCK-587 ; la plateforme reçoit le sien).

## Contexte

Mesuré le 2026-10-08 sur `dev` (`bef65b3e`) :

- **Tout opérateur est super-admin, ou n'est rien.** `EnsureSuperAdmin` ferme `/api/admin/*` à
  tout niveau autre que `super_admin` (`app/Http/Middleware/EnsureSuperAdmin.php:32`). Les niveaux
  `support` et `viewer` existent dans l'enum `PlatformProfileLevel` et dans `docs/models-spec.md`
  §51, mais seule la factory les crée (`PlatformProfileFactory.php`).
- **Le jour où ils seraient créables, ils ouvriraient les agences.** `resolvePlatform`
  (`MembershipCapabilityResolver.php`) accorde à `support` `crm.view_all`, `crm.export`,
  `payments.export`, `reports.*`, `messaging.archive` — **sur n'importe quelle agence**, par les
  routes d'agence et non par la console.
- **Deux chemins d'octroi.** La cooptation (`SuperAdminCooptationService`) en est un ; le second est
  `PUT /api/users/{user}/role {role: super_admin}` (`UserRoleController::mutateProfileForRole`), qui
  crée le profil sans invitation ni activité, **réactive un profil révoqué** (`revoked_at = null`) et
  promeut un `support` en `super_admin`.
- Aucun moyen de **retirer** un opérateur actif ; `models-spec` §51 décrit pourtant la révocation.

## Décision

**Les gestes de la console sont un vocabulaire à part, `App\Models\Enums\PlatformAbility`, attribué
par niveau dans une matrice écrite en code. Une route de `/api/admin` déclare le geste qu'elle sert ;
une route qui n'en déclare aucun est réservée au `super_admin`. Un opérateur n'agit jamais par les
routes d'agence.**

### 1. Le vocabulaire et la matrice

`PlatformAbility` (`platform.<domaine>.<verbe>`) est distinct de `Capability`. La matrice
(`PlatformAbility::forLevel()`) :

| Niveau | Gestes |
|---|---|
| `viewer` | rapports et métriques ; santé et planificateur ; agences **sans** KYC ni membres (liste, fiche, santé, biens, abonnement) |
| `support` | `viewer` + fiche, sessions et activité d'un utilisateur, membres d'une agence ; actions de support (mot de passe, verrou, 2FA, sessions) ; bloquer / réactiver un compte ; **lire** la file de modération ; recherche globale |
| `super_admin` | tous les gestes ; **lui seul** impersonne, efface, coopte et retire un opérateur, décide en modération, lit le KYC, l'audit transverse et les jobs en échec |

Le KYC, l'audit transverse et les jobs en échec (dont le corps porte des données personnelles)
restent au `super_admin`.

### 2. Le refus par défaut

- `EnsureSuperAdmin` laisse **entrer** tout titulaire d'un `PlatformProfile` actif (`User::hasActivePlatformProfile()`),
  2FA exigée pour tous les niveaux (TCK-589).
- Le middleware `platform-can:<geste>` (`EnsurePlatformAbility`) se pose **par groupe** dans
  `routes/api/admin.php`. `EnsureSuperAdmin` lit les middlewares de la route : **sans
  `platform-can:`, seul le `super_admin` passe.** Élargir le prédicat d'entrée n'ouvre donc aucune
  route par omission.
- `GET /api/admin/me/abilities` rend les gestes de l'appelant : le front filtre la console avec,
  sans recopier la matrice.

### 3. Les listes blanches d'agence sont vidées

`resolvePlatform` ne rend plus rien pour `support` et `viewer` : un opérateur de ces niveaux n'a
**aucune** capacité d'agence. `super_admin` garde le court-circuit (et `Gate::before`), inchangé.

### 4. La cooptation est le seul chemin d'octroi

- `PUT /api/users/{user}/role` n'accepte plus `super_admin` (`UpdateUserRoleRequest::ALLOWED_ROLES`) ;
  la branche plateforme de `UserRoleController` disparaît.
- L'invitation porte le **niveau** (`level`, défaut `super_admin`) ; la confirmation de la 2FA du
  coopté (`SuperAdminTwoFactorController::attachSuperAdminRole`) **lit l'invitation acceptée** : elle
  applique son niveau et pose `granted_by_id` = l'inviteur. Sans invitation de cooptation acceptée,
  la confirmation n'octroie rien.
- `platform:create-super-admin` / `platform:grant-super-admin` (console Artisan) restent l'amorçage,
  hors API.

### 5. Le retrait

`POST /api/admin/super-admins/{user}/revoke` (motif requis, step-up) pose `revoked_at`, supprime les
jetons de l'opérateur, ferme ses sessions d'impersonation (ADR-0055), journalise
`super_admin_operator_revoked` et prévient les pairs. **Jamais le dernier `super_admin` actif** : les
lignes `super_admin` actives sont verrouillées (`lockForUpdate()->get()`, compte en PHP — jamais
`lockForUpdate()->count()`, piège PostgreSQL n° 2) ; **jamais soi-même**.

Changer le niveau d'un opérateur actif = le retirer puis le recoopter (hors périmètre).

## Alternatives écartées

- **Étendre `Capability` de cas `platform.*`** : `Capability` est le vocabulaire d'un rôle d'agence,
  porté par `agency_role_capabilities` et gardé par `check-capability-readers.mjs`. Un geste
  plateforme n'a pas d'agence ; le mêler au catalogue d'agence aurait rendu ces cas assignables à
  un rôle personnalisé (le défaut que `platformReserved()` existe pour fermer).
- **Une liste d'autorisation par route nommée** : une route sans nom (il y en a) aurait échappé à la
  liste. La déclaration se porte sur la route elle-même.
- **Garder les listes blanches de `resolvePlatform`** : elles ouvrent les données d'agence par les
  routes d'agence, hors de la console et de son journal.

## Conséquences

- Un `support` lit les données personnelles nécessaires au support, un `viewer` n'en lit aucune.
- Une route neuve sous `/api/admin` est au `super_admin` tant qu'on ne lui déclare pas de geste :
  le défaut est sûr, l'oubli coûte une ouverture à faire, jamais une fuite.
- Le front ne connaît pas la matrice : il lit `me/abilities`.

## Application

- `app/Models/Enums/PlatformAbility.php` (matrice), `app/Http/Middleware/EnsureSuperAdmin.php`,
  `app/Http/Middleware/EnsurePlatformAbility.php`, `routes/api/admin.php`.
- Tests : `PlatformRoutesDefaultDenyTest` (parcourt `Route::getRoutes()` et compare à la matrice,
  plus une route de test sans geste), `PlatformOperatorLevelsTest`, `RevokePlatformOperatorTest`,
  `SuperAdminGrantOnlyByCooptationTest`.

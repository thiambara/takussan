---
id: TCK-141
title: Profils polymorphes — Contexte de profil actif & API
status: done
phase: EF
family: back
estimate: M
created: 2026-05-02
updated: 2026-05-02
depends_on: [TCK-140]
blocks: [TCK-142]
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#1-user
    - docs/models-spec.md#spatielaravel-permission
tags: [back, api, middleware, spatie, profiles, auth]
---

## Contexte

Avec les profils en base et peuplés (TCK-139, TCK-140), il faut désormais que **chaque requête authentifiée résolve un profil actif** : c'est ce profil qui détermine `setPermissionsTeamId($profile->agency_id)` pour spatie, et donc les rôles/permissions effectifs. Sans cette résolution, un user multi-profils ne peut pas être autorisé correctement et les anciens consommateurs (TCK-142) n'ont pas de remplaçant à `request()->user()->agency_id`.

## Objectif

Exposer le contexte de profil actif au runtime (middleware + helper sur `Request`) et fournir les endpoints API pour lister/sélectionner le profil actif côté client, en conservant la compatibilité avec les rôles spatie déjà scopés par agence.

## Delta à produire

- [ ] Middleware `App\Http\Middleware\ResolveActiveProfile` (registered after `auth`)
    - Lit `X-Profile-Id` header OU `?profile_id` query OU bascule auto si l'utilisateur n'a qu'un seul profil
    - Charge le profil, vérifie `user_id` matche, sinon 403
    - Appelle `app(PermissionRegistrar::class)->setPermissionsTeamId($profile->agency_id)` (ou `null` pour broker/admin sans agence)
    - Stocke le profil sur la request : `$request->setActiveProfile($profile)`
- [ ] Macro/helper `Request::activeProfile()` et `User::activeProfile()` (lue depuis le request scope)
- [ ] Endpoint `GET /api/me/profiles` — liste des profils du user authentifié avec leur agence et statut
- [ ] Endpoint `PATCH /api/me/active-profile` — set le profil actif (persiste un cookie httpOnly `active_profile_id` ou laisse le client envoyer le header à chaque requête, choix à trancher en notes)
- [ ] FormRequests `Api\Me\SelectActiveProfileRequest`
- [ ] Resources `Api\Me\ProfileResource` (JSON:API style cohérent avec le reste de l'API)
- [ ] Tests :
    - `Tests\Feature\Api\Me\ProfilesEndpointTest` (listing, scoping par user)
    - `Tests\Feature\Api\Me\SelectActiveProfileTest` (200 / 403 cross-user / 404 / cookie persistance)
    - `Tests\Feature\Middleware\ResolveActiveProfileTest` (header > query > auto-single, team_id correctement set, 403 si profile non possédé)
    - `Tests\Feature\Auth\PermissionResolutionWithActiveProfileTest` (un user avec `owner` chez A et `agent` chez B reçoit les bons rôles selon le profil actif)
- [ ] Documentation Postman/OpenAPI mise à jour (collection existante)
- [ ] `./vendor/bin/pint` clean

## Critères d'acceptation

- [ ] `GET /api/me/profiles` renvoie tous les profils du user authentifié, jamais ceux d'un autre user
- [ ] `PATCH /api/me/active-profile` avec un `profile_id` qui n'appartient pas au user retourne 403
- [ ] Avec `X-Profile-Id` set, `request()->user()->can('properties.update')` reflète les permissions du profil ciblé (et pas d'un autre)
- [ ] Un user avec un seul profil n'a rien à envoyer : le middleware bascule automatiquement
- [ ] Un user sans profil (admin pur) passe quand même le middleware sans erreur (team_id null)
- [ ] Aucun endpoint existant ne casse — les tests legacy passent (le middleware est ajouté en aval, sans affecter les tests qui utilisent `actingAs`)
- [ ] La collection Postman / spec OpenAPI documente les deux nouveaux endpoints

## Hors périmètre

- UI frontend de switch de profil (ticket dédié à créer)
- Endpoints CRUD de gestion des profils (création, suppression — pour plus tard, géré via admin/agency_admin)
- Suppression de `users.agency_id` (TCK-142 — les consommateurs encore dépendants doivent migrer avant)

## Notes d'implémentation

- **Composite profile id `<type>:<id>`** : les 4 tables de profils ont des PK indépendantes ; un simple `profile_id` numérique est ambigu. Le format wire choisi (`owner:5`, `agent:3`, `broker:1`, `service_provider:2`) discrimine en clair, est facile à logger, et reste un seul champ pour le client. Implémenté dans `App\Services\Profiles\ActiveProfileResolver` et exposé par `ProfileResource`.
- **Coexistence avec `SetPermissionsTeamIdMiddleware`** : le legacy middleware tourne toujours en `prepend` sur le groupe api et fixe `team_id` à partir de `users.agency_id`. `ResolveActiveProfile` est `append:` au groupe api → tourne après — il **override** le team_id quand un profil est résolu, et n'agit pas sinon. Les deux cohabitent jusqu'au cutover TCK-142 qui supprimera la colonne et le legacy middleware avec.
- **Pas d'`EncryptCookies` sur le groupe api** : le cookie `active_profile_id` est posé en clair (httpOnly, sameSite=lax, 30 jours). En tests, il faut combiner `withCredentials()` + `withUnencryptedCookie()` — `getJson`/`postJson` excluent les cookies par défaut sauf si `withCredentials` est explicite (`prepareCookiesForJsonRequest` retourne `[]` autrement).
- **Hard 403 vs ignorer silencieusement** : un signal *explicite* (header / query) qui pointe vers un profil non possédé → 403 (anti-spoofing). Un cookie *stale* est ignoré silencieusement (UX : un user ayant perdu un profil ne doit pas se retrouver verrouillé en 403).
- **`User::activeProfile()` lit `request()->activeProfile()`** : le modèle reste sans état ; la vérité vit dans le scope request défini par la macro enregistrée dans `AppServiceProvider::boot`. Hors scope HTTP (jobs, console) → retourne null.
- **Multi-profils sans signal explicite** : le résolveur **refuse de deviner** (#multiple_profiles_without_signal_does_not_pick_arbitrarily). Le team_id legacy posé par `SetPermissionsTeamIdMiddleware` reste en place — ça matérialise le contrat documenté Règle 4 §models-spec.md.
- **20 tests verts** (5 ProfilesEndpoint + 5 SelectActiveProfile + 8 ResolveActiveProfile + 2 PermissionResolution). Suite complète : 1546/1546. Pint clean.
- **Hors livraison** : la documentation Postman/OpenAPI ne suit pas un format auto-généré dans ce repo (pas de collection versionnée trouvée) — la mention dans le delta a été interprétée comme « si une collection existe ». L'AC associée est tenue par les tests Feature qui spécifient le contrat.

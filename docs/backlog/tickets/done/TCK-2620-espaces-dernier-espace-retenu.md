---
id: TCK-2620
title: "Espaces du compte (API) : un compte de plusieurs agences retrouve le dernier espace choisi, et chaque espace dit sa ville"
status: done
phase: P1
family: back
estimate: S
wave: 87
created: 2026-11-10
updated: 2026-11-11
depends_on: []
blocks: [TCK-2621]
spec_refs:
  features:
    - "docs/features.md#profils--contexte-actif-tck-138--tck-142"
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
    - "docs/features.md#22-rôles--permissions"
  models:
    - "docs/models-spec.md#1-user"
tags: [back, profils, adr-0004, audit-ux, app]
---

## Objectif utilisateur

Un agent qui travaille pour deux agences arrive, à chaque connexion, dans l'espace où il travaillait la dernière fois, au lieu d'atterrir en « Client » sans rien qui le dise ; et quand il doit choisir, chaque espace se reconnaît à son agence, son rôle et sa ville.

## Contrat de données

Relevé sur `dev` (1bce3798a) le 2026-11-10 :

- `ResolveActiveProfile` (`app/Http/Middleware/ResolveActiveProfile.php:98-152`) suit cinq niveaux :
  1. `X-Profile-Id` ;
  2. `X-Active-Profile-Hint` ;
  3. le cookie `active_profile_id` ;
  4. l'auto-bascule, **seulement si tous les profils actifs sont dans une même agence** ;
  5. aucun profil.
- Avec plusieurs agences et sans signal, aucun profil n'est lié : `agency_id` est nul, et `dashboard/me` retombe sur la vue bailleur ou locataire.
- Le seul souvenir du dernier espace est le cookie `httpOnly` `active_profile_id` (30 jours). `PATCH me/active-profile` le pose, la déconnexion l'efface (`AuthController.php:157`), et la connexion ne le pose pas. **Aucune trace en base.**
- `/api/auth/me` ne dit pas QUEL profil l'API a lié : seulement `agency_id` et `roles`. Le front devine le persona par un ordre figé (`personas.ts`, `TYPE_DOMINANT`).
- `ProfileResource` (`app/Http/Resources/Api/Me/ProfileResource.php:33-50`) rend `agency{id, name, slug, kind}`. **Pas de ville**, et le front affiche le slug en sous-ligne (`EspacesDuMenu.tsx:92`, `slugAAfficher`).

Delta : un niveau de résolution de plus (le dernier espace retenu sur le compte), l'identifiant du profil lié rendu par `/api/auth/me`, et la ville de l'agence de chaque profil.

## Direction UX / Artistique

Sans objet (ticket API). L'écran qui s'en sert est TCK-2621.

## Contraintes strictes (métier)

- **Ordre de résolution.** Le dernier espace retenu passe APRÈS les trois signaux explicites (en-tête, indice, cookie) et AVANT l'auto-bascule. Un choix mémorisé l'emporte sur l'ordre par défaut, y compris pour un compte de plusieurs profils dans une même agence.
- **Le profil mémorisé n'est lié que s'il est encore un profil ACTIF du compte**, jugé par `ActiveProfileResolver::resolve`, comme le cookie. Un profil suspendu, supprimé ou d'une agence suspendue est ignoré en silence : jamais de 403.
- **Rien ne change pour l'impersonation** : ses règles actuelles de résolution priment.
- **Mémoriser est un état interne, pas une préférence.** La valeur vit dans `users.metadata`, jamais dans `preferences` (qui est « choisi par l'utilisateur et exposé », `models-spec.md` §1). Elle n'est pas rendue par `/api/me` : seul l'identifiant du profil lié l'est.
- **« Se souvenir de mon choix »** : `PATCH /api/me/active-profile` accepte `remember` (booléen, `true` par défaut).
  - `false` efface la valeur mémorisée.
  - Le cookie garde son comportement actuel.
- **Déconnexion** : elle efface le cookie, comme aujourd'hui, mais **pas** la valeur mémorisée. C'est ce qui permet de retrouver son espace à la connexion suivante.
- **Ville de l'agence** : c'est celle de l'adresse principale (`Agency::addresses`), `null` sans adresse. Aucune lecture de plus par profil : les adresses sont chargées avec les agences de `MeProfilesController::index`.
- **ADR-0004 est amendé AVANT le code** (amendement du 2026-11-10 de [ADR-0004](../../../adr/0004-profil-actif-resolu-par-middleware.md)).

## Delta à produire

- [ ] `MeProfilesController::updateActive` + sa FormRequest : `remember` (`sometimes|boolean`). Écrit ou efface `users.metadata.last_active_profile` (identifiant composite `type:id`).
- [ ] `ResolveActiveProfile` : niveau « dernier espace retenu », entre le cookie et l'auto-bascule.
- [ ] `UserResource` (`/api/auth/me`) : `active_profile_id` (identifiant composite du profil lié, `null` sans profil).
- [ ] `ProfileResource` : `agency.city` ; `MeProfilesController::index` charge l'adresse principale avec l'agence (pas de N+1).
- [ ] Tests :
  - `ProfilesEndpointTest` :
    - `test_un_compte_de_deux_agences_retrouve_le_dernier_espace_choisi` ;
    - `test_remember_faux_efface_le_dernier_espace` ;
    - `test_un_profil_retenu_suspendu_est_ignore_sans_403` ;
    - `test_le_cookie_et_l_indice_l_emportent_sur_le_dernier_espace` ;
    - `test_la_deconnexion_garde_le_dernier_espace` ;
    - `test_la_ville_de_l_agence_est_rendue`.
  - `UserResource` : `test_me_rend_le_profil_lie`.
  - Compte de requêtes de `GET /api/me/profiles` : constant entre 1 et 3 agences.

## Critères d'acceptation

- [ ] AC1 — Un compte agent chez A et chez B choisit B (`PATCH me/active-profile`), se déconnecte, puis se reconnecte. Sans cookie ni en-tête, `GET /api/auth/me` rend `agency_id = B` et `active_profile_id = "agent:<id chez B>"`.
- [ ] AC2 — Le même parcours avec `remember: false` rend `agency_id: null` et `active_profile_id: null` à la reconnexion.
- [ ] AC3 — Si le profil chez B est suspendu entre deux connexions, la reconnexion rend 200 sans profil lié (et non 403), et la valeur est ignorée.
- [ ] AC4 — `GET /api/me/profiles` rend `agency.city = "Thiès"` pour un profil chez une agence dont l'adresse principale est à Thiès, et `null` pour une agence sans adresse.
- [ ] AC5 — Ablation : retirer le niveau « dernier espace » de `ResolveActiveProfile` fait rougir le test d'AC1.

## Hors périmètre

- L'écran « Dans quel espace travaillez-vous ? » et le menu du compte (TCK-2621).
- Les compteurs par espace (« 3 demandes · 2 visites aujourd'hui ») de la maquette : une lecture par espace, non servie ici.
- Le persona côté front (TCK-2621 l'aligne sur `active_profile_id`).

## Notes d'implémentation

Implémenté le 2026-11-11 (agent back-coque), sur `feat/audit-ux-app-lot-1` (acfe73fb3).

**Ce qui est livré.**

- `App\Services\Profiles\DernierEspaceRetenu` : lit, retient et oublie `users.metadata.last_active_profile`
  (forme `type:id`). L'écriture est **une requête SQL** qui fusionne la clé dans le `jsonb`
  (`COALESCE(metadata, '{}') || jsonb_build_object(…)`, et `metadata - 'clé'` pour oublier), et non un
  `$user->save()`. Deux raisons : d'autres écrivains touchent `metadata` (`previous_public_slugs`,
  `force_2fa_reconfigure`), qu'un lire-modifier-réécrire écraserait ; et changer d'espace ne « modifie »
  pas le compte (ni `updated_at`, ni réindexation Scout, ni événement de modèle).
- `ResolveActiveProfile` : le niveau 4, entre le cookie et l'auto-bascule. Il est jugé par
  `ActiveProfileResolver::resolve`, comme le cookie, et ignoré sans 403. Il n'est pas lu sous un jeton
  d'impersonation (`ImpersonationService::isImpersonationToken`). Le docblock passe à six niveaux.
- `PATCH /api/me/active-profile` : `remember` (`sometimes|boolean`, vrai par défaut). `false` efface la
  valeur retenue ; le cookie garde son comportement. Sous impersonation, la route rend déjà 403
  (`EnforceImpersonationReadOnly`), donc la consultation n'écrit rien. Un test le vérifie.
- `UserResource` : `active_profile_id`, le profil lié par le middleware (`type:id`) ou `null`. La clé est
  dans la branche « pour soi » : un membre listé par `AgencyController` ne la reçoit pas.
- `ProfileResource` : `agency.city`, tirée de la première adresse de l'agence (ordonnée par `addresses.id`),
  ou `null`. La clé est **absente** si les adresses n'ont pas été chargées, plutôt qu'un `null` qui
  affirmerait « pas d'adresse ». `index` et `updateActive` les chargent.
- `takussan-api/CLAUDE.md`, § Profil actif : l'ordre de résolution est mis à jour.

**Ce que la re-mesure a montré de différent.**

1. **Le compte de requêtes de `GET /api/me/profiles` n'était PAS constant avant ce ticket.** Mesuré :
   17 requêtes pour 1 agence, 27 pour 3 (un agent et un bailleur par agence). La cause est TCK-2524 :
   `ProfileResource::slugDeSaFiche()` appelait `AgentPublic::parSlug` (5 lectures) **pour chaque profil
   d'agent**, alors que la fiche est celle de l'appelant. Ce calcul est désormais mémorisé par requête
   (attribut de requête). Après correctif : compte identique entre 1 et 3 agences, et l'ablation du
   mémo rougit le test.
2. **« Agence suspendue » : le ticket et les ADR se contredisent, et le code suit les ADR.** Le ticket
   dit qu'un profil « d'une agence suspendue est ignoré ». Mais :
   - la même phrase le fait juger « par `ActiveProfileResolver::resolve`, comme le cookie », et ce
     jugement ne regarde que le statut du **profil** ;
   - l'amendement d'ADR-0004 dit « encore actif et appartient toujours au compte » ;
   - [ADR-0048](../../../adr/0048-effet-d-une-suspension-d-agence.md) § 4 garde aux membres d'une agence suspendue la lecture et l'export
     (`MembershipCapabilityResolver::KEPT_WHEN_SUSPENDED`). L'auto-bascule et le cookie lient déjà un
     tel profil. Écrire 423 n'est pas 403.

   Le niveau 4 lie donc un profil actif d'une agence suspendue, comme le cookie. **Le porteur tranche.**
   Aucun test ne fige l'un ou l'autre comportement.
3. **AC3 avec deux agences seulement ne peut pas rendre « sans profil lié ».** Une fois B suspendu, il
   ne reste qu'une agence active, et l'auto-bascule lie A. Le test d'AC3 pose donc trois agences.
4. **ADR-0004, § Application, garde « `remember=false` n'écrit rien »** : le ticket dit « efface la
   valeur mémorisée », et c'est ce qui est fait (`false` → `oublier`). À harmoniser dans l'ADR.
5. **La réponse de connexion** (`POST /api/auth/login`, `UserResource::pourSoi`) rend
   `active_profile_id: null` : aucun middleware n'a lié de profil à cette requête-là. Le profil lié se
   lit sur `/api/auth/me`. Son `agency_id` reste celui de l'accesseur (auto-bascule).
6. Le super-admin ne lit pas le niveau 4, comme il ne lit ni cookie ni auto-bascule.

**Tests.** `tests/Feature/Api/Me/ProfilesEndpointTest.php` compte 10 tests neufs, ceux du ticket plus
ceux de l'ADR :
- `remember` non booléen refusé ;
- le retenu l'emporte sur l'auto-bascule dans une même agence ;
- l'impersonation ne lit pas l'espace retenu ;
- le compte de requêtes.

Chacun a été vérifié par une ablation ciblée (10 sur 10 rouges, restauration prouvée par `md5`). La
classe est verte (24 tests). Les classes voisines sont vertes (97 tests) :
- `SelectActiveProfileTest`, `ResolveActiveProfileTest`, `AuthLoginTest` ;
- `ImpersonationReadOnlyTest`, `MultiProfileStrictAccessTest`, `UserResourceSparseFieldsTest` ;
- `ContactPreferencesTest`, `OAuthCallbackTest`, `AgencyMembersRolesDansLAgenceTest`.

**Reste.**
- `/sync-specs` après fusion : `models-spec.md` § 1 (clé `metadata.last_active_profile`) et
  `features.md` (ordre de résolution).
- Le front (TCK-2621) lit `active_profile_id` et `agency.city`.


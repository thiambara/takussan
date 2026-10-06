---
id: TCK-586
title: "Le courtier quitte le code et la base : tables, modèles, lectures publiques, fixtures et libellés retirés (ADR-0030)"
status: todo
phase: P2
family: technique
estimate: M
wave: 73
created: 2026-10-06
updated: 2026-10-06
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#36-brokerprofile-
    - docs/models-spec.md#38-brokeragencycollaboration-
    - docs/models-spec.md#9-usercustomerrelationship
    - docs/models-spec.md#1-user
tags: [back, front, profils, suppression, migration, adr-0030, analyse-par-acteur]
---

## Objectif utilisateur

Plus aucun visiteur ne voit un compte présenté comme « professionnel de l'agence » sur la seule foi
d'un profil courtier fantôme, et plus aucun opérateur ne lit dans la console un statut de courtier
qui n'existe pas : l'acteur « courtier » disparaît entièrement du produit.

## Contexte

Analyse par acteur du 2026-10-06 (vague 73) : le rapport « courtier » a établi que l'acteur ne peut
**rien faire** depuis ADR-0027 (aucune route, aucune page, aucun chemin de création), mais que les
données conservées continuent d'agir. **Le porteur a décidé le 2026-10-06 de retirer le courtier à
100 % du code** ; la décision et son argument sont dans
[ADR-0030](../../adr/0030-le-courtier-quitte-le-code-et-la-base.md), qui remplace ADR-0027.

Mesuré sur `origin/dev` (`e3ab4a4e`) — l'inventaire complet, relu par la session :

### 1. Ce qui agit encore, et à tort

- `app/Http/Resources/PropertyResource.php:284` — `actsAsAgent()` rend `true` pour tout titulaire d'un
  `BrokerProfile`, sans collaboration avec l'agence du bien ni échéance (`active_until` n'est lu nulle
  part). Le docblock l.268-272 décrit encore « a BrokerProfile collaborating with it ».
- `app/Services/Public/PublicProfileFacts.php:307` et `app/Http/Controllers/Public/PublicAgencyController.php:293`
  comptent tout courtier parmi les professionnels, sans filtre.
- `app/Http/Resources/Api/Admin/UserDetailResource.php:51-54` lit `brokerProfile->status` ;
  la table `broker_profiles` n'a pas de colonne `status` (migration `2026_05_02_000003`,
  et `ActiveProfileResolver.php:108` : « BrokerProfile has no status enum ») → toujours `null`.
- `app/Http/Controllers/Api/AgencyController.php:332-337` ouvre une agence à tout courtier dont la
  collaboration n'est pas supprimée, quel que soit son statut.

### 2. L'empreinte à retirer

**API — modèles et données**
- `app/Models/Profiles/BrokerProfile.php`, `app/Models/Profiles/BrokerAgencyCollaboration.php`
- `app/Models/Concerns/HasProfiles.php:11,57-59` (relation `brokerProfile()`), `:143` (carte de `hasProfile`),
  `:183` (`isProfessional()`), docblocks `:82-94`, `:128`, `:236`
- `app/Models/User.php:162` (filtre de requête `role=broker`)
- `app/Models/Enums/RelationshipType.php:9` (`BrokerClient = 'broker_client'`) ; docblock `UserRole.php:10`
- `database/migrations/2026_05_02_000003_create_broker_profiles_table.php`,
  `2026_05_02_000005_create_broker_agency_collaborations_table.php` (restent : on ne réécrit pas l'historique)
- `database/factories/Profiles/BrokerProfileFactory.php` ; `database/factories/UserFactory.php:8,83,151-155` (`withBrokerProfile()`)
- `database/seeders/Core/UserSeeder.php:14-15,169,184,200-207` ; `database/seeders/TestSeeder.php:13,40,67` ;
  `database/seeders/Support/SeedingContext.php:9,43,113,156` ;
  `database/seeders/Crm/UserCustomerRelationshipSeeder.php:47-54` (relations `broker_client`)

**API — lectures**
- `app/Http/Controllers/Api/Admin/UserDetailController.php:52,86,101,175,196-197`
- `app/Http/Controllers/Api/Admin/AgencyDetailController.php:134` (eager-load `brokerProfile`)
- `app/Http/Controllers/Api/Admin/AgencyModerationController.php:129-136` (sous-requête courtier du comptage de membres)
- `app/Http/Controllers/Api/AgencyController.php:313` (commentaire), `:332-337`
- `app/Http/Controllers/Public/PublicAgencyController.php:17,293`
- `app/Services/Public/PublicProfileFacts.php:9,285,307`
- `app/Http/Resources/PropertyResource.php:8,268-285`
- `app/Http/Resources/Api/Admin/UserDetailResource.php:51-54`
- `app/Services/Privacy/DataExportBuilder.php:85`
- commentaires seuls : `Me/MeProfilesController.php:32-33`, `Requests/Api/Me/SelectActiveProfileRequest.php:28`,
  `Services/Profiles/ActiveProfileResolver.php:28-36,108`, `Services/Invitation/ServiceProviderInvitationService.php:184`

**API — tests** : `tests/Feature/Database/ProfileSchemaTest.php:57-69,143-185,220-250,341-366` ;
`tests/Feature/Models/HasProfilesTraitTest.php:7,33-38,102-118,137-139` ;
`tests/Feature/Public/PublicRoleTest.php:13,85,205` ; `tests/Feature/Testing/TestSeederTest.php:18,33` ;
`tests/Feature/Api/Me/ProfilesEndpointTest.php` ; `tests/Support/ResourceInventory.php:120`.

**Web** : `src/types/customer.ts:75` (`'broker_client'`), `src/types/super-admin.ts:233` (`profiles.broker`),
`src/components/admin/super/user-detail.tsx:368` (badge), `src/messages/{fr,en,wo}.json` (clé `broker`,
l.6673 / 6673 / 6073), commentaires historiques : `types/user.ts:7-16`, `lib/roles.ts:93`,
`components/profile/ProfileBadge.tsx:45,83`, `components/admin/super/announcements.tsx:59-62`,
`hooks/usePublishIntent.ts:65`, `app/onboarding/host/page.tsx:30`, et les tests
`types/__tests__/user-roles.parity.test.ts`, `components/layout/__tests__/AppSidebar{,.audience}.test.tsx`,
`hooks/__tests__/usePublishIntent.test.ts:97`, `lib/__tests__/roles-derives.test.ts:121`.

**Racine** : `scripts/check-profile-badge-contrast.mjs` (mention du courtier).

### 3. Ce qui porte le mot « broker » et N'EST PAS l'acteur — à ne pas toucher

Le *password broker* de Laravel : `config/auth.php:13,20`, `app/Services/Admin/UserSupportService.php:16`,
`app/Services/Admin/AgencyProvisioningService.php:111`, `tests/Feature/Auth/AccountDeletionStepUpTest.php:353`,
`tests/Support/ImpactSelector.php:133`.

### 4. Pourquoi la suppression en base est sans perte

Aucune route ni aucun service n'a jamais créé de `BrokerProfile` (ADR-0027, re-mesuré) ; seuls les
seeders et les factories en fabriquent. L'API n'écrit `relationship_type` qu'à `agent_client`
(`CustomerController.php:135`) : les lignes `broker_client` ne viennent que de
`UserCustomerRelationshipSeeder.php:54`. L'API n'a jamais servi en production.

## Contrat de données

- **Supprimé** : tables `broker_profiles`, `broker_agency_collaborations` ; valeur `broker_client` de
  `user_customer_relationships.relationship_type` ; relation `User::brokerProfile()` ; clé
  `profiles.broker` de la fiche utilisateur super-admin (`GET /api/admin/users/{user}`) ; ligne
  `broker` des rôles listés par la même fiche ; clé `broker` de l'export de données personnelles.
- **Inchangé** : `filter[role]=broker` sur les listes d'utilisateurs tombe dans la branche `default`
  existante (`whereRaw('1 = 0')`, `User.php` et `UserDetailController.php`) → liste vide, pas d'erreur.
- `RelationshipType` : `owner_tenant`, `agent_client`.

## Direction UX / Artistique

Rien à concevoir : la fiche utilisateur de la console super-admin perd un badge, sans trou visuel.

## Contraintes strictes (métier)

- **Ne pas réécrire les migrations de création** : une migration nouvelle supprime, avec un `down()`
  qui recrée les deux tables **vides** au schéma d'origine (contraintes et noms d'index compris) — et
  le dit dans son commentaire. Ordre : `broker_agency_collaborations` puis `broker_profiles`.
- La migration de données sur `user_customer_relationships` supprime les lignes `broker_client`
  **avant** que le cas d'énumération disparaisse ; son `down()` est vide et l'écrit (on ne recrée pas
  des fixtures). Aucune exception attrapée dans une transaction (piège PostgreSQL n°1).
- **Le password broker de Laravel n'est pas touché** (§3 du Contexte).
- `PropertyResource::actsAsAgent()` garde sa seule branche `isAgentAt($agency->id)`. TCK-595
  (vague 73) y ajoutera un calcul par lot : ce ticket ne fait que retirer la branche courtier.
- Coordination vague 73 : `AgencyController:338-343` (branche prestataire du même calcul) appartient
  à TCK-592 ; `AgencyModerationController::transition` à TCK-600 ; le bloc `collaborators` de
  `PropertyResource` à TCK-598. Ce ticket ne touche que les lignes courtier listées au Contexte.
- Les gardes de TCK-494/TCK-495 restent et continuent d'affirmer l'absence de `broker`
  (`AppSidebar.audience.test.tsx`, `user-roles.parity.test.ts`) ; seuls leurs commentaires changent
  de référence (ADR-0030).
- `./vendor/bin/pint` avant commit ; `npm run lint` et `npx tsc --noEmit` côté web.

## Delta à produire

### Base
- [ ] Migration `drop_broker_tables` : `Schema::dropIfExists('broker_agency_collaborations')`, puis
      `broker_profiles` ; `down()` recrée les deux tables vides au schéma des migrations
      `2026_05_02_000003` et `2026_05_02_000005`.
- [ ] Migration `delete_broker_client_customer_relationships` : suppression des lignes
      `relationship_type = 'broker_client'`.

### API
- [ ] Supprimer `BrokerProfile`, `BrokerAgencyCollaboration`, `BrokerProfileFactory`.
- [ ] `HasProfiles` : retirer `brokerProfile()`, l'entrée de la carte de `hasProfile`, la branche de
      `isProfessional()` ; nettoyer les docblocks.
- [ ] `RelationshipType` : retirer `BrokerClient`. `UserRole` : docblock.
- [ ] `User::customQueryFilters()` et `UserDetailController` : retirer les branches `broker`
      (filtre, eager-loads l.86/101, ligne de rôle l.196-197, docblock l.175).
- [ ] `UserDetailResource` : retirer la clé `profiles.broker`.
- [ ] `AgencyDetailController:134`, `AgencyModerationController:129-136`, `AgencyController:332-337`
      (+ commentaire l.313) : retirer les branches courtier.
- [ ] `PublicAgencyController:293`, `PublicProfileFacts:285,307`, `PropertyResource:268-285` : retirer
      les lectures courtier.
- [ ] `DataExportBuilder:85` : retirer la clé `broker`.
- [ ] Commentaires : `MeProfilesController`, `SelectActiveProfileRequest`, `ActiveProfileResolver`,
      `ServiceProviderInvitationService` — renvoyer à ADR-0030.
- [ ] Seeders : `UserSeeder`, `TestSeeder`, `SeedingContext`, `UserCustomerRelationshipSeeder` ;
      `UserFactory::withBrokerProfile()`.

### Tests API
- [ ] `ProfileSchemaTest` : remplacer les cas courtier par `test_broker_tables_are_gone`
      (`Schema::hasTable` faux pour les deux tables).
- [ ] `HasProfilesTraitTest`, `PublicRoleTest`, `TestSeederTest`, `ProfilesEndpointTest`,
      `ResourceInventory` : retirer les cas courtier ; garder dans `PublicRoleTest` un cas « un
      utilisateur sans profil d'agent dans l'agence du bien n'est pas présenté comme agent ».
- [ ] Test de migration de données : une ligne `broker_client` présente avant `migrate` a disparu
      après ; une ligne `agent_client` est intacte.

### Web
- [ ] `types/customer.ts`, `types/super-admin.ts`, `user-detail.tsx` (badge), clé `broker` des trois
      dictionnaires.
- [ ] Commentaires historiques et tests listés au Contexte : référence à ADR-0030 ; les assertions
      d'absence restent.
- [ ] `scripts/check-profile-badge-contrast.mjs` : retirer la mention.

### Après fusion
- [ ] `/sync-specs` : retirer `docs/models-spec.md` §36, §38, la ligne `broker_profile()` de §1 et
      `broker_client` de §9 ; réécrire la note de `docs/features.md` §2.1 (l.371).

## Critères d'acceptation

- [ ] AC1 — Après `php artisan migrate`, `Schema::hasTable('broker_profiles')` et
      `Schema::hasTable('broker_agency_collaborations')` sont faux ; après `migrate:rollback` d'un pas,
      les deux tables existent, vides, avec leurs index d'origine (le job `migrations-pgsql` couvre ce
      `down()`, la migration étant postérieure à la borne TCK-278).
- [ ] AC2 — Une ligne `user_customer_relationships` de type `broker_client` présente avant la
      migration n'existe plus après ; une ligne `agent_client` est intacte.
- [ ] AC3 — `grep -rnE "BrokerProfile|BrokerAgencyCollaboration|brokerProfile|broker_profiles|broker_agency_collaborations|broker_client|BrokerClient|withBrokerProfile" takussan-api/app takussan-api/database/factories takussan-api/database/seeders takussan-api/routes takussan-api/tests takussan-web/src`
      ne rend que les deux migrations de création d'origine et les deux migrations de ce ticket.
- [ ] AC4 — `grep -rn -i broker takussan-api/app takussan-api/config takussan-api/tests` ne rend que les
      cinq occurrences du *password broker* listées au §3 du Contexte (plus `tests/impact-map.json`,
      régénéré par la CI).
- [ ] AC5 — `GET /api/admin/users/{user}` ne contient plus de clé `profiles.broker` ;
      `GET /api/admin/users?filter[role]=broker` rend 200 et une liste vide.
- [ ] AC6 — `php artisan migrate:fresh --seed` ne crée aucun compte courtier (vérifié par
      `TestSeederTest` et par l'absence des tables).
- [ ] AC7 — Côté web, aucune clé `broker` dans `src/messages/*.json` ; `npm run lint`,
      `npx tsc --noEmit` et `npm run test` verts ; les gardes `user-roles.parity` et
      `AppSidebar.audience` sont vertes et affirment toujours l'absence de `broker`.
- [ ] AC8 — Suite backend entière verte sur PostgreSQL (rituel de fin de branche).

## Hors périmètre

- Toute réintroduction d'un intermédiaire indépendant : fonctionnalité neuve (ADR-0030, Conséquences).
- La fuite de `commission_share` des collaborateurs agents sur la fiche publique : TCK-598.
- Le calcul des commissions par collaborateur (`commission_share`) : TCK-595.
- La branche prestataire de `AgencyController::visibleAgencyIds` et l'unicité des collaborations
  prestataires : TCK-592.
- La liste recopiée des rôles ciblables par une annonce (dette D-64).

## Notes d'implémentation

_(à remplir par implementing-specs)_

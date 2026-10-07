---
id: TCK-586
title: "Le courtier quitte le code et la base : tables, modèles, lectures publiques, fixtures et libellés retirés (ADR-0030)"
status: done
phase: P1
family: technique
estimate: M
wave: 73
created: 2026-10-06
updated: 2026-10-07
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
    - docs/features.md#22-rôles--permissions
    - docs/features.md#11-gestion-des-biens
  models:
    - docs/models-spec.md#36-brokerprofile-
    - docs/models-spec.md#38-brokeragencycollaboration-
    - docs/models-spec.md#9-usercustomerrelationship
    - docs/models-spec.md#8-propertycollaborator
    - docs/models-spec.md#1-user
tags: [back, front, profils, suppression, migration, adr-0030, collaborateurs, analyse-par-acteur]
---

## Objectif utilisateur

- **Visiteur** : plus aucun compte n'est présenté comme « agent immobilier » ou « professionnel de
  l'agence » sur la seule foi d'un profil courtier fantôme, et le téléphone affiché sur une fiche est
  toujours celui d'un membre de l'agence du bien, jamais celui d'un utilisateur quelconque.
- **Super-admin** : la console ne lit plus de statut sur une colonne qui n'existe pas, et ses
  libellés sont en français.
- **Tout utilisateur** : l'export de ses données personnelles contient tous ses profils.

L'acteur « courtier » disparaît entièrement du produit.

## Contexte

Analyse par acteur du 2026-10-06 (vague 73) : le rapport « courtier » a établi que l'acteur ne peut
**rien faire** depuis ADR-0027 (aucune route, aucune page, aucun chemin de création), mais que les
données conservées continuent d'agir. **Le porteur a décidé le 2026-10-06 de retirer le courtier à
100 % du code** ; la décision et son argument sont dans
[ADR-0030](../../adr/0030-le-courtier-quitte-le-code-et-la-base.md), qui remplace ADR-0027.
Passe de correction du même jour : §5 à §7 ajoutés (défauts voisins portés par les points B7, B20
du rapport et par le bloc d'export que ce ticket modifie).

Mesuré sur `origin/dev` (`e3ab4a4e`) — l'inventaire complet, relu par la session :

### 1. Ce qui agit encore, et à tort

- **Fiche de bien** — `app/Http/Resources/PropertyResource.php:284` : `actsAsAgent()` rend `true` pour
  tout titulaire d'un `BrokerProfile`, sans collaboration avec l'agence du bien ni échéance
  (`active_until` n'est lu nulle part). Il alimente `is_agent` du propriétaire et du contact principal
  (`:306`, `:322`). Le docblock `:268-272` décrit encore « a BrokerProfile collaborating with it ».
- **Fiche et index des agents** — `app/Services/Public/PublicProfileFacts.php:307` compte tout courtier
  parmi les professionnels, sans filtre ; lu par `PublicAgentController.php:155` (index) et `:269`
  (`public_role` de la fiche).
- **Équipe d'une agence** — `app/Http/Controllers/Public/PublicAgencyController.php:293` le compte parmi
  « les professionnels de CETTE agence », et dans `stats.agents`, alors que son propre commentaire
  (`:284-288`) exige « un profil actif ici ».
- **La suite affirme le défaut** : `tests/Feature/Public/PublicRoleTest.php:85,96` attend
  `public_role = 'agent'` pour un courtier sans aucune agence, et `:205,213,215` attend
  `'equipe-courtier' => 'agent'` et `stats.agents = 2`.
- **Colonne fantôme** — `app/Http/Resources/Api/Admin/UserDetailResource.php:51-54` lit
  `brokerProfile->status` ; la table `broker_profiles` n'a pas de colonne `status` (migration
  `2026_05_02_000003`, et `ActiveProfileResolver.php:108` : « BrokerProfile has no status enum ») →
  toujours `null`, en silence (aucun `shouldBeStrict` dans `app/`, `bootstrap/`, `config/`). La clé
  `profiles.broker` est émise pour **tout** utilisateur (`null` à défaut).
- **Visibilité d'agence** — `app/Http/Controllers/Api/AgencyController.php:332-337` ouvre une agence à
  tout courtier dont la collaboration n'est pas supprimée, quel que soit son `status` (`paused`,
  `ended`).
- `HasProfiles::isProfessional()` (`:180-185`) compte le courtier ; la méthode n'a aucun appelant
  dans `app/` (grep `isProfessional()`).

### 2. L'empreinte à retirer

**API — modèles et données**
- `app/Models/Profiles/BrokerProfile.php`, `app/Models/Profiles/BrokerAgencyCollaboration.php`
- `app/Models/Concerns/HasProfiles.php:11,57-59` (relation `brokerProfile()`), `:143` (carte de `hasProfile`),
  `:183` (`isProfessional()`), docblocks `:82-94`, `:128`, `:236`
- `app/Models/User.php:162` (filtre de requête `role=broker`)
- `app/Models/Enums/RelationshipType.php:9` (`BrokerClient = 'broker_client'`), casté par
  `UserCustomerRelationship.php:23` ; docblock `UserRole.php:10`
- `database/migrations/2026_05_02_000003_create_broker_profiles_table.php`,
  `2026_05_02_000005_create_broker_agency_collaborations_table.php` (restent : on ne réécrit pas l'historique)
- `database/factories/Profiles/BrokerProfileFactory.php` ; `database/factories/UserFactory.php:8,83,151-155` (`withBrokerProfile()`)
- `database/seeders/Core/UserSeeder.php:14-15,169,184,200-207` ; `database/seeders/TestSeeder.php:13,40,67` ;
  `database/seeders/Support/SeedingContext.php:9,43,113,156` ;
  `database/seeders/Crm/UserCustomerRelationshipSeeder.php:47-54` (relations `broker_client`)

**API — lectures**
- `app/Http/Controllers/Api/Admin/UserDetailController.php:52,86,101,175,196-197`
- `app/Http/Controllers/Api/Admin/AgencyDetailController.php:134` (eager-load `brokerProfile`)
- `app/Http/Controllers/Api/Admin/AgencyModerationController.php:128-136` (branche courtier de l'`union` du comptage de membres)
- `app/Http/Controllers/Api/AgencyController.php:313` (commentaire), `:332-337`
- `app/Http/Controllers/Public/PublicAgencyController.php:17,288,293`
- `app/Services/Public/PublicProfileFacts.php:9,285-286,307`
- `app/Http/Resources/PropertyResource.php:8,268-285`
- `app/Http/Resources/Api/Admin/UserDetailResource.php:51-54`
- `app/Services/Privacy/DataExportBuilder.php:85`
- commentaires seuls : `Me/MeProfilesController.php:32-33`, `Requests/Api/Me/SelectActiveProfileRequest.php:28`,
  `Services/Profiles/ActiveProfileResolver.php:28-36,108`, `Services/Invitation/ServiceProviderInvitationService.php:184`

**API — tests** : `tests/Feature/Database/ProfileSchemaTest.php:57-69,143-185,220-250,341-366` ;
`tests/Feature/Models/HasProfilesTraitTest.php:7,33-38,102-118,137-139` ;
`tests/Feature/Public/PublicRoleTest.php:13,85,96,205,213,215` ; `tests/Feature/Testing/TestSeederTest.php:18,33` ;
`tests/Feature/Api/Me/ProfilesEndpointTest.php` ; `tests/Support/ResourceInventory.php:120`.

**Web** : `src/types/customer.ts:75` (`'broker_client'`), `src/types/super-admin.ts:233` (`profiles.broker`),
`src/components/admin/super/user-detail.tsx:368` (badge), `src/messages/{fr,en,wo}.json`
(`superAdmin.userDetail.profiles.broker`, l.6673 / 6673 / 6073), commentaires historiques :
`types/user.ts:7-16`, `lib/roles.ts:93`, `components/profile/ProfileBadge.tsx:45,83`,
`components/admin/super/announcements.tsx:59-62`, `hooks/usePublishIntent.ts:65`,
`app/onboarding/host/page.tsx:30`, et les tests `types/__tests__/user-roles.parity.test.ts`,
`components/layout/__tests__/AppSidebar{,.audience}.test.tsx`, `hooks/__tests__/usePublishIntent.test.ts:97`,
`lib/__tests__/roles-derives.test.ts:121`.

**Racine et documents d'entrée** : `scripts/check-profile-badge-contrast.mjs:51,110` (mention du
courtier) ; `CLAUDE.md:463` et `takussan-api/CLAUDE.md:99` listent encore `BrokerProfile` parmi les
profils — ils mentiraient au premier lecteur après la fusion.

### 3. Ce qui porte le mot « broker » et N'EST PAS l'acteur — à ne pas toucher

Le *password broker* de Laravel — six lignes dans cinq fichiers : `config/auth.php:13,20`,
`app/Services/Admin/UserSupportService.php:16`, `app/Services/Admin/AgencyProvisioningService.php:111`,
`tests/Feature/Auth/AccountDeletionStepUpTest.php:353`, `tests/Support/ImpactSelector.php:133`.

### 4. Pourquoi la suppression en base est sans perte

Aucune route ni aucun service n'a jamais créé de `BrokerProfile` (ADR-0027, re-mesuré) ; seuls les
seeders et les factories en fabriquent. L'API n'écrit `relationship_type` qu'à `agent_client`
(`CustomerController.php:135`) : les lignes `broker_client` ne viennent que de
`UserCustomerRelationshipSeeder.php:54`. L'API n'a jamais servi en production. ⚠ Une ligne
`broker_client` laissée en base après le retrait du cas ferait lever `ValueError` à la lecture (cast
`UserCustomerRelationship.php:23`) : la migration de données passe **avant**.

### 5. Collaborateur de bien : n'importe quel utilisateur devient le contact public (point B7)

- `app/Http/Requests/Api/StorePropertyCollaboratorRequest.php` : `'user_id' => ['required', 'exists:users,id']`
  — **n'importe quel** compte de la plateforme, sans lien avec l'agence du bien, sans notification ni
  acceptation (`PropertyCollaboratorController.php:26-46` ne pose qu'`invited_at`).
  `UpdatePropertyCollaboratorRequest.php:38` laisse changer `role` sans autre contrôle.
- Qui peut le faire : `PropertyPolicy::update` (`:96-120`) — l'auteur du bien (un bailleur) ou tout
  compte de la même agence.
- Ce que ça déclenche : `PrimaryPropertyContact::for()` fait du **plus ancien collaborateur `agent`**
  le contact principal (`PrimaryPropertyContact.php:28-29`), et
  `GET /api/public/properties/{slug}/contact` — **anonyme** (`routes/api/public.php:118`) — rend
  **son téléphone** (`PublicPropertyController.php:966`). Les messages et leads lui sont adressés
  (`PropertyConversationResolver.php:51`), et sa carte (nom, avatar, `is_agent`) s'affiche sur la
  fiche (`PropertyResource.php:306`).
- Conséquence : un bailleur peut publier, sur la fiche de son bien, le téléphone d'un utilisateur
  quelconque (identifiants séquentiels) et détourner vers lui les contacts. La suite le consacre :
  `tests/Feature/Api/PropertyCollaboratorTest.php:18-35` ajoute un `User::factory()` nu et attend 201.

### 6. Libellés affichés en anglais ou bruts (point B20)

- `src/messages/fr.json:6674` : `superAdmin.userDetail.profiles.serviceProvider` vaut
  `"Service provider"` — l'anglais dans la console française, sur le badge voisin de celui que ce
  ticket retire (`user-detail.tsx:369`).
- `src/components/customer-dashboard/CustomerDetailTabs.tsx:84` affiche
  `rel.relationship_type.replace('_', ' / ')` — « owner / tenant », « agent / client »,
  « broker / client » — dans toutes les langues, sans next-intl (principe n°5).

### 7. Export de données personnelles : un profil manque

`app/Services/Privacy/DataExportBuilder.php:82-87` exporte `owners`, `agents`, `broker`,
`service_provider` — **pas** `agencyAdminProfiles`. Un admin d'agence qui exerce son droit d'accès
reçoit une archive qui tait le profil qui lui donne le plus de droits. La ligne `broker` que ce
ticket retire est la voisine immédiate.

## Contrat de données

- **Supprimé** : tables `broker_profiles`, `broker_agency_collaborations` ; valeur `broker_client` de
  `user_customer_relationships.relationship_type` ; relation `User::brokerProfile()` ; clé
  `profiles.broker` de la fiche utilisateur super-admin (`GET /api/admin/users/{user}`) ; ligne
  `broker` des rôles listés par la même fiche ; clé `broker` de l'export de données personnelles.
- **Inchangé** : `filter[role]=broker` sur les listes d'utilisateurs tombe dans la branche `default`
  existante (`whereRaw('1 = 0')`, `User.php:166` et `UserDetailController.php:54`) → liste vide, pas d'erreur.
- `RelationshipType` : `owner_tenant`, `agent_client`.
- **`POST /api/properties/{property}/collaborators`** et **`PUT …/{collaborator}`** (quand `role` est
  fourni) — `user_id` doit appartenir à l'agence du bien (`properties.agency_id`), selon le rôle :

  | `role` | Éligible |
  |---|---|
  | `agent`, `manager` | personnel de l'agence : `isAgentAt` OU `isAgencyAdminAt` (prédicat de TCK-587) |
  | `co_owner` | `isOwnerAt` |
  | `viewer` | l'un des trois |

  Bien sans agence → aucun éligible. Sinon **422** sur `user_id`, message par clé
  `__('collaborators.not_in_agency')` (règle de coexistence n°1). Aucune ligne existante n'est
  migrée : l'API n'a jamais servi en production.
- **Export** (`profile.json`) : `profiles.agency_admins` ajouté (liste, comme `owners`/`agents`).

## Direction UX / Artistique

Rien à concevoir. La fiche utilisateur de la console perd un badge, sans trou visuel. Le type d'une
relation client s'affiche par un libellé traduit dans les trois langues ; une valeur inconnue
s'affiche par un libellé neutre (« Autre relation »), jamais par son code brut.

## Contraintes strictes (métier)

- **Ne pas réécrire les migrations de création** : une migration nouvelle supprime, avec un `down()`
  qui recrée les deux tables **vides** au schéma d'origine (contraintes et noms d'index compris) — et
  le dit dans son commentaire. Ordre : `broker_agency_collaborations` puis `broker_profiles`.
- La migration de données sur `user_customer_relationships` supprime les lignes `broker_client`
  **avant** que le cas d'énumération disparaisse ; son `down()` est vide et l'écrit (on ne recrée pas
  des fixtures). Aucune exception attrapée dans une transaction (piège PostgreSQL n°1).
- **Le password broker de Laravel n'est pas touché** (§3 du Contexte).
- Les commentaires historiques réécrits dans `app/`, `config/`, `routes/`, `database/factories`,
  `database/seeders` parlent du « courtier » et renvoient à ADR-0030 **sans** l'identifiant `broker` :
  la garde `CourtierAbsentTest` (Delta) n'admet que les lignes du §3.
- `PropertyResource::actsAsAgent()` garde sa seule branche `isAgentAt($agency->id)`.
- La règle d'éligibilité des collaborateurs vit dans **un** objet (`App\Rules\CollaboratorEligibleForProperty`),
  appelé par les deux FormRequests — pas recopiée.
- **Coordination vague 73** (ordre de fusion indifférent sauf mention) :
  - **TCK-595** ajoute un calcul par lot dans `PropertyResource` et lit `accepted_at` des
    collaborateurs ; ce ticket ne fait que retirer la branche courtier de `actsAsAgent` (l.272-285).
  - **TCK-598** possède le bloc `collaborators` et `buildUserLite` de `PropertyResource` (l.161-181,
    voisins) ; la règle du §5 ne touche que les FormRequests de collaborateurs.
  - **TCK-587** nomme le prédicat « personnel de l'agence » dans `MembershipCapabilityResolver` et
    resserre `PropertyPolicy::update`. Si 586 fusionne d'abord, la règle écrit
    `isAgentAt || isAgencyAdminAt` avec un commentaire `TCK-587` ; 587 la branchera sur son prédicat.
  - **TCK-592** possède la branche prestataire de `AgencyController::visibleAgencyIds` (`:338-343`) ;
    **TCK-600** `AgencyModerationController::transition` et la recherche d'`UserDetailController::index`.
  - **TCK-591** possède `CustomerDetailTabs.tsx` ; seul le libellé de la ligne `:84` est à nous.
  - **TCK-601** modifie `DataExportBuilder.php:83` (`owners`) ; seules les lignes `:84-86` sont à nous.
  - **TCK-504** (vague 58, ouvert) touche le même contrôleur de collaborateurs (agent principal) :
    conflit de lignes voisines dans `PropertyCollaboratorController`, aucune réécriture concurrente.
- Les gardes de TCK-494/TCK-495 restent et continuent d'affirmer l'absence de `broker`
  (`AppSidebar.audience.test.tsx`, `user-roles.parity.test.ts`) ; seuls leurs commentaires changent
  de référence (ADR-0030).
- `./vendor/bin/pint` avant commit ; `npm run lint` et `npx tsc --noEmit` côté web.

## Delta à produire

### Base
- [x] Migration `drop_broker_tables` : `Schema::dropIfExists('broker_agency_collaborations')`, puis
      `broker_profiles` ; `down()` recrée les deux tables vides au schéma des migrations
      `2026_05_02_000003` et `2026_05_02_000005`.
- [x] Migration `delete_broker_client_customer_relationships` : suppression des lignes
      `relationship_type = 'broker_client'`.

### API — retrait
- [x] Supprimer `BrokerProfile`, `BrokerAgencyCollaboration`, `BrokerProfileFactory`.
- [x] `HasProfiles` : retirer `brokerProfile()`, l'entrée de la carte de `hasProfile`, la branche de
      `isProfessional()` ; nettoyer les docblocks.
- [x] `RelationshipType` : retirer `BrokerClient`. `UserRole` : docblock.
- [x] `User::customQueryFilters()` et `UserDetailController` : retirer les branches `broker`
      (filtre, eager-loads l.86/101, ligne de rôle l.196-197, docblock l.175).
- [x] `UserDetailResource` : retirer la clé `profiles.broker`.
- [x] `AgencyDetailController:134`, `AgencyModerationController:128-136`, `AgencyController:332-337`
      (+ commentaire l.313) : retirer les branches courtier.
- [x] `PublicAgencyController:288,293`, `PublicProfileFacts:285-286,307`, `PropertyResource:268-285` :
      retirer les lectures courtier et réécrire les docblocks (règle : `agent` = `AgentProfile` ou
      `AgencyAdminProfile` actif).
- [x] `DataExportBuilder:85` : retirer la clé `broker`.
- [x] Commentaires : `MeProfilesController`, `SelectActiveProfileRequest`, `ActiveProfileResolver`,
      `ServiceProviderInvitationService` — renvoyer à ADR-0030 (cf. Contraintes, sans `broker`).
- [x] Seeders : `UserSeeder`, `TestSeeder`, `SeedingContext`, `UserCustomerRelationshipSeeder` ;
      `UserFactory::withBrokerProfile()`.

### API — collaborateurs de bien (§5)
- [x] `App\Rules\CollaboratorEligibleForProperty(Property $property, ?string $role)` : la table du
      Contrat de données ; profils non supprimés ; bien sans agence → refus.
- [x] `StorePropertyCollaboratorRequest::rules()` : `user_id` → `['required', 'integer', 'exists:users,id',
      new CollaboratorEligibleForProperty($this->route('property'), $this->input('role'))]`.
- [x] `UpdatePropertyCollaboratorRequest` : quand `role` est présent, la même règle s'applique au
      `user_id` **du collaborateur existant** (un bailleur passé de `viewer` à `agent` → 422).
- [x] Clé `collaborators.not_in_agency` dans `lang/{fr,en,wo}.json` (bloc propre au ticket).
- [x] `PropertyCollaboratorTest` : les cas existants ajoutent un agent de l'agence du bien
      (`AgentProfile` dans `property.agency_id`) au lieu d'un `User::factory()` nu.

### API — export (§7)
- [x] `DataExportBuilder::payloads()` : `'agency_admins' => $user->agencyAdminProfiles()->get()->toArray()`
      à la place de la ligne `broker`.

### Tests API
- [x] **`tests/Unit/CourtierAbsentTest.php`** (garde structurelle — ce qui rougit aujourd'hui) :
  - parcourt `app/`, `config/`, `routes/`, `database/factories/`, `database/seeders/` et échoue sur
    toute ligne qui contient `broker` (insensible à la casse) hors des quatre lignes applicatives du
    §3, en nommant `fichier:ligne` ;
  - `class_exists('App\Models\Profiles\BrokerProfile')` et `…\BrokerAgencyCollaboration` sont faux ;
    `method_exists(User::class, 'brokerProfile')` est faux ; `RelationshipType::tryFrom('broker_client')`
    est `null`.
- [x] `ProfileSchemaTest` : remplacer les cas courtier par `test_broker_tables_are_gone`
      (`Schema::hasTable` faux pour les deux tables).
- [x] `PublicRoleTest` : les comptes `courtier` / `equipe-courtier` restent, **sans profil** (simples
      publieurs) ; les valeurs attendues deviennent `owner` et `stats.agents = 1`. Garder un cas « un
      utilisateur sans profil d'agent dans l'agence du bien a `owner.is_agent = false` sur
      `GET /api/public/properties/{slug}` ».
- [x] `HasProfilesTraitTest`, `TestSeederTest` (rôles : cinq), `ProfilesEndpointTest`,
      `ResourceInventory` : retirer les cas courtier.
- [x] Test de migration de données : une ligne `broker_client` présente avant `migrate` a disparu
      après ; une ligne `agent_client` est intacte.
- [x] `PropertyCollaboratorTest` — nouveaux cas (§5) :
      `test_store_refuse_un_utilisateur_sans_profil_dans_l_agence_du_bien`,
      `test_store_refuse_un_agent_d_une_autre_agence`,
      `test_store_refuse_un_bailleur_de_l_agence_en_role_agent`,
      `test_store_accepte_un_agent_et_un_admin_de_l_agence`,
      `test_store_accepte_un_bailleur_de_l_agence_en_co_owner`,
      `test_update_refuse_de_passer_un_bailleur_en_role_agent`,
      `test_le_contact_public_ne_rend_pas_le_telephone_d_un_tiers`.
- [x] `UserDetailTest::test_la_fiche_ne_porte_plus_de_profil_courtier` ;
      `DataExportTest::test_l_export_d_un_admin_d_agence_contient_son_profil_d_admin`.

### Web
- [x] `types/customer.ts`, `types/super-admin.ts`, `user-detail.tsx` (badge), clé
      `superAdmin.userDetail.profiles.broker` des trois dictionnaires.
- [x] `fr.json` : `superAdmin.userDetail.profiles.serviceProvider` → « Prestataire ».
- [x] Fiche client (onglet relations) : le type de relation s'affiche par un libellé traduit
      (`owner_tenant`, `agent_client`, et un repli neutre pour une valeur inconnue) ; valeurs wolof
      soumises à la revue lexicale de TCK-339.
- [x] Commentaires historiques et tests listés au Contexte : référence à ADR-0030 ; les assertions
      d'absence restent.
- [x] `scripts/check-profile-badge-contrast.mjs` : retirer la mention.

### Documents d'entrée
- [x] `CLAUDE.md:463` (principe n°1) et `takussan-api/CLAUDE.md:99` : retirer `BrokerProfile` de la
      liste des profils (cinq types, ADR-0030).

### Après fusion
- [ ] `/sync-specs` : retirer `docs/models-spec.md` §36, §38 et toutes leurs mentions (l.59, 67, 150,
      152, 237, 289, 299, 1656, 1717, 1838, 2948, 3230-3231, 3316-3319), `broker_client` de §9
      (l.667) et de `RelationshipType` (l.2969), « agence/courtier » de `commission_amount` (l.869) et
      l.3357 ; réécrire la note de `docs/features.md` §2.1 (l.451) ; ajouter l'éligibilité des
      collaborateurs à la ligne P1 de §1.1 (l.84).

## Critères d'acceptation

- [x] **AC1** — Après `php artisan migrate`, `Schema::hasTable('broker_profiles')` et
      `Schema::hasTable('broker_agency_collaborations')` sont faux (`ProfileSchemaTest::test_broker_tables_are_gone`,
      rouge sur le code actuel) ; après `migrate:rollback` d'un pas, les deux tables existent, vides,
      avec leurs index d'origine (le job `migrations-pgsql` couvre ce `down()`, la migration étant
      postérieure à la borne TCK-278).
- [x] **AC2** — Une ligne `user_customer_relationships` de type `broker_client` présente avant la
      migration n'existe plus après ; une ligne `agent_client` est intacte.
- [x] **AC3** — `CourtierAbsentTest` est vert, et **rouge sur le code actuel** (il nomme au moins
      `PropertyResource.php:284`, `PublicProfileFacts.php:307`, `PublicAgencyController.php:293`,
      `UserDetailResource.php:51`, `AgencyController.php:332`). Ablation : remettre
      `->merge(BrokerProfile::query()…)` dans `PublicProfileFacts::rolesPublics()` le fait rougir en
      nommant cette ligne ; ajouter une ligne contenant `broker` dans `config/auth.php` hors des deux
      du §3 le fait rougir aussi (l'exception est par ligne, pas par fichier).
- [x] **AC4** — `grep -rnE "BrokerProfile|BrokerAgencyCollaboration|brokerProfile|broker_profiles|broker_agency_collaborations|broker_client|BrokerClient|withBrokerProfile" takussan-api/app takussan-api/database takussan-api/routes takussan-api/tests takussan-web/src --exclude=impact-map.json`
      ne rend que les deux migrations de création d'origine et les deux migrations de ce ticket.
      `grep -rn -i broker takussan-api/app takussan-api/config takussan-api/tests --exclude=impact-map.json`
      ne rend que les six lignes du §3.
      *(Vérifié avec un écart, voir Notes : les deux `grep` rendent aussi les tests d'absence que le
      Delta exige — `CourtierAbsentTest`, `ProfileSchemaTest`, test de migration, `UserDetailTest`,
      `DataExportTest` —, et rien d'autre ; aucune ligne côté web.)*
- [x] **AC5** — `GET /api/admin/users/{user}` : `assertJsonMissingPath('data.profiles.broker')` pour un
      utilisateur quelconque (rouge sur le code actuel : la clé vaut `null`) ;
      `GET /api/admin/users?filter[role]=broker` rend 200 et `data` vide.
- [x] **AC6** — `PublicRoleTest` réécrit : `GET /api/public/agents/courtier` → `data.public_role = 'owner'` ;
      équipe `equipe-statuts` → `{'equipe-admin-actif': 'agent', 'equipe-agent-suspendu': 'owner',
      'equipe-courtier': 'owner'}` et `data.stats.agents = 1` ; fiche de bien d'un publieur sans profil
      d'agent dans l'agence → `data.owner.is_agent = false`.
- [x] **AC7** — `php artisan migrate:fresh --seed` ne crée aucun compte courtier (`TestSeederTest` sur
      cinq rôles, et l'absence des tables).
      *(Prouvé par ces deux tests et par la garde sur `database/seeders` ; `migrate:fresh --seed` n'a
      pas été joué : la base `takussan` du `.env` est partagée avec le dépôt principal.)*
- [x] **AC8 — Collaborateurs.** Sur un bien de l'agence A dont le bailleur B est l'auteur, en tant que B :
  - `POST …/collaborators` avec un utilisateur sans profil, `role=agent` → **422** sur `user_id`, aucune
    ligne créée (rouge sur le code actuel : 201) ;
  - avec un agent **de l'agence C** → 422 (attrape une règle qui ne vérifierait que « a un profil d'agent ») ;
  - avec un bailleur de A, `role=agent` → 422 ; `role=co_owner` → 201 ;
  - avec un agent de A, puis un admin de A, `role=agent` → 201 (attrape une règle trop stricte) ;
  - `PUT` du collaborateur `co_owner` vers `role=agent` → 422, rôle inchangé en base ;
  - après la tentative refusée, `GET /api/public/properties/{slug}/contact` rend `phone` = téléphone de
    B, jamais celui du tiers.
  Ablation : retirer la règle de `StorePropertyCollaboratorRequest` fait rougir les trois premiers
  points et le dernier ; la retirer d'`UpdatePropertyCollaboratorRequest` fait rougir le `PUT`.
- [x] **AC9 — Export.** `DataExportBuilder::payloads($admin)['profile.json']['profiles']['agency_admins']`
      contient une entrée dont `agency_id` est l'agence de l'admin ; la clé `broker` est absente
      (rouge sur le code actuel : clé `agency_admins` absente).
- [x] **AC10 — Libellés.** En `fr` : la fiche utilisateur super-admin d'un prestataire affiche
      « Prestataire » (rouge sur le code actuel : « Service provider ») ; l'onglet relations d'une fiche
      client de type `owner_tenant` n'affiche pas « owner / tenant » mais le libellé français, et une
      valeur inconnue n'affiche pas son code (deux tests de composant).
- [ ] **AC11** — Côté web, aucune clé `broker` dans `src/messages/*.json` ; `npm run lint`,
      `npx tsc --noEmit` et `npm run test` verts ; les gardes `user-roles.parity` et
      `AppSidebar.audience` sont vertes et affirment toujours l'absence de `broker`.
      *(Non coché : `npm run test` est une suite entière — lancée par la session. Le reste est vert :
      lint, `tsc`, 30 fichiers vitest, aucune clé `broker`.)*
- [ ] **AC12** — Suite backend entière verte sur PostgreSQL (rituel de fin de branche).
      *(Lancée par la session. Ici : 70 tests des classes touchées, puis 604 tests de 69 classes liées —
      verts.)*

## Hors périmètre

- Toute réintroduction d'un intermédiaire indépendant : fonctionnalité neuve (ADR-0030, Conséquences).
  Les points B3-B6, B8, B9, B11, B15, B16 du rapport décrivaient le chemin de réexposition : sans objet.
- Un parcours d'invitation / acceptation des collaborateurs (`accepted_at` posé par le collaborateur) :
  fonctionnalité. Le défaut de fuite qu'il aurait aussi fermé l'est ici par l'éligibilité (§5).
- La fuite de `commission_share` des collaborateurs sur la fiche publique : TCK-598.
- Le calcul des commissions par collaborateur et le tableau de bord agent : TCK-595.
- La branche prestataire de `AgencyController::visibleAgencyIds`, l'unicité des collaborations
  prestataires et le filtre `status` de `serviceProviderRoleAllows` : TCK-592.
- Lecture des biens par les collaborateurs (B14) : dette consignée par la session.
- Mode strict d'Eloquent (`preventAccessingMissingAttributes`) pour attraper toute colonne fantôme :
  amélioration, à mesurer d'abord contre les sparse fieldsets (qui sélectionnent des sous-ensembles
  de colonnes et le feraient lever partout).
- La liste recopiée des rôles ciblables par une annonce (dette D-64).

## Notes d'implémentation

Re-mesure du 2026-10-07 sur `32dd0b39` — écarts au ticket :

- **`UserSeeder::seedBrokerProfile()` était une branche morte** : aucune charge de `UserSeeder` ni de
  `DemoUsersSeeder` ne porte la persona `broker` (relevé : `admin`, `agent`, `owner`,
  `service_provider`). Seuls `TestSeeder` et les factories fabriquaient un courtier.
- **Les relations secondaires `broker_client` du seeder CRM sont retirées, pas converties** en
  `agent_client` : une seconde relation d'agent sur un client serait une donnée neuve, hors
  périmètre. Le `faker` du seeder est graine (`2026`) : retirer l'appel `boolean(20)` décale le tirage
  de tout ce qui le suit dans `YearOfActivitySeeder` (données de démonstration différentes, mêmes
  volumes attendus).
- **La clé `collaborators.not_in_agency` vit dans `lang/{fr,en,wo}/collaborators.php`**, pas dans
  `lang/*.json` comme l'écrit le Delta : le dépôt range toutes ses clés de domaine en fichiers PHP
  (`lang/<locale>/<domaine>.php`), c'est l'arête que lit la carte d'impact (TCK-476), et un fichier
  neuf n'entre en conflit avec aucun autre ticket de la vague. `__('collaborators.not_in_agency')`
  résout à l'identique. Le libellé wolof est soumis à la revue lexicale de TCK-339.
- **Le `PUT` porte l'erreur sur `role`, pas sur `user_id`** : la requête ne contient pas de
  `user_id` ; la règle est rejouée par `withValidator()` sur le `user_id` du collaborateur existant.
- **AC4, second `grep` (`-i broker` sur `tests/`)** ne peut pas rendre « les six lignes du §3 »
  seulement : les tests que le Delta exige nomment l'acteur pour affirmer son absence
  (`CourtierAbsentTest`, `ProfileSchemaTest::test_broker_tables_are_gone`, le test de migration de
  données, `UserDetailTest` avec `filter[role]=broker`, `DataExportTest`). Le premier `grep` d'AC4
  rend les quatre migrations plus ces mêmes tests d'absence, et rien d'autre.
- **`ActiveProfileResolver`** : la branche `default` du `match` de statut est désormais inatteignable
  (toute classe de `TYPE_MAP` a une enum de statut) ; gardée, commentée.
- **AC1, « au schéma d'origine » se mesure** : `ProfileSchemaTest` compare colonnes, index (noms
  compris) et clés étrangères rendus par le `down()` à ceux que rendent les deux migrations de
  création elles-mêmes, au lieu d'une liste recopiée.
- **Tests joués** (2026-10-07, après rétablissement de Docker) : les 10 classes touchées, 70 tests
  verts ; puis 69 classes liées (agences, équipe publique, agents publics, console utilisateurs,
  relations client, profils, export, seeders, collaborateurs), 604 tests verts en 245 s.
  `bin/impacted-tests.php --base=dev` demande la suite entière (règle neuve absente de la carte) :
  elle revient à la session.
- **Docker** : le transfert de ports de Docker Desktop était figé le 2026-10-07 vers 16:55
  (conteneurs `healthy`, PDO sur 5433 et Meilisearch sur 7701 sans réponse) — signalé à la session ;
  les classes de test sur base ont attendu son rétablissement.

Exécutions qui portent les AC cochées (2026-10-07, worktree `takussan-tck-586`) :

- `php artisan test tests/Unit/CourtierAbsentTest.php tests/Feature/Database/ProfileSchemaTest.php
  tests/Feature/Database/DeleteBrokerClientRelationshipsMigrationTest.php
  tests/Feature/Models/HasProfilesTraitTest.php tests/Feature/Testing/TestSeederTest.php
  tests/Feature/Api/Me/ProfilesEndpointTest.php tests/Feature/Public/PublicRoleTest.php
  tests/Feature/Api/PropertyCollaboratorTest.php tests/Feature/Api/Admin/UserDetailTest.php
  tests/Feature/Api/Admin/DataExportTest.php` → **70 passed (284 assertions)** — AC1, AC2, AC3,
  AC5, AC6, AC7, AC8, AC9.
- 69 classes liées (sélection par `grep` des routes et symboles touchés) → **604 passed**, 245 s.
- `npx vitest run` sur les deux tests de composant d'AC10 → 3 passed ; sur `user-roles.parity`,
  `components/layout/__tests__`, `usePublishIntent`, `roles-derives`, `components/profile` → 245
  passed — AC10, AC11 (partie).
- `npm run lint` → 0 problème ; `npx tsc --noEmit` → sortie 0 ; gardes racine → toutes vertes.
- AC4 : les deux `grep` de l'AC, lus fichier par fichier (voir l'écart plus haut).

Ablations rejouées :

- **AC3** — `CourtierAbsentTest` lancé avant le retrait : rouge, nomme entre autres
  `PropertyResource.php:284`, `PublicProfileFacts.php:307`, `PublicAgencyController.php:293`,
  `UserDetailResource.php:51`, `AgencyController.php:332`. Après : vert. Remettre
  `->merge(BrokerProfile::query()…)` dans `rolesPublics()` → rouge sur cette ligne ; ajouter à
  `config/auth.php` une ligne `'courtier' => env('AUTH_BROKER_ACTOR', 'x'),` à côté des deux lignes
  admises → rouge sur cette seule ligne.
- **AC8** — retirer la règle de `StorePropertyCollaboratorRequest` : 5 rouges (sans profil, agent
  d'une autre agence, bailleur en `agent`/`manager`, bien sans agence, téléphone du contact public) ;
  la neutraliser dans `UpdatePropertyCollaboratorRequest` : 1 rouge (le `PUT` `co_owner` → `agent`).
- **AC9** — rétablir `'broker' => …` à la place d'`agency_admins` : `DataExportTest` rouge.
- **AC5** — rétablir une clé `profiles.broker` (`null`) dans `UserDetailResource` : rouge.
- **AC1** — retirer la migration `drop_broker_tables` : `test_broker_tables_are_gone` rouge.
- **AC6** — `actsAsAgent()` sur « un profil d'agent quelque part » (la forme du défaut courtier) :
  `test_la_fiche_d_un_bien_ne_presente_pas_en_agent_…` rouge.
- **AC10** — les deux tests de composant, rejoués sur `UserDetail`/`CustomerDetailTabs` et `fr.json`
  d'origine : 3 rouges ; restaurés : 3 verts.

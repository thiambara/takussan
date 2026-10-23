# ADR-0005 — Le contrat HTTP conserve `roles[]`, désormais dérivé des profils

- **Statut** : Accepté — **avec une dette assumée et nommée** ; **amendé le 2026-10-23** (cf. § *Amendement du 2026-10-23 — `roles` ne compte que les profils actifs de l'agence en jeu*)
- **Date de la décision** : 2026-05-17 · **Rédigé rétroactivement** : 2026-08-12
- **Tickets** : TCK-278

## Contexte

[ADR-0002](0002-role-est-un-profil-polymorphe.md) supprime la notion de rôle côté backend. Le
frontend, lui, en dépendait partout : construction de la navigation, verrouillage de routes, rendu
conditionnel — tout passait par `isAgent(user.roles)`, `isAdmin(user.roles)`.

Faire descendre les capacités jusqu'au front en même temps que le cutover backend aurait signifié
réécrire la navigation, les gardes de layout et les prédicats de rôle **dans le même chantier**. Le
cutover backend était déjà XL.

## Décision

**Le contrat HTTP conserve un champ plat `roles: string[]` sur le User. Il n'est plus stocké : il est
DÉRIVÉ des profils** (`HasProfiles::profileTypes()`, qui remplace l'ancien `getRoleNames()` de
spatie).

Le front continue de raisonner en rôles. Le back raisonne en capacités.

## Conséquences

**C'est une dette, et elle est nommée comme telle.** Deux modèles mentaux coexistent de part et
d'autre du contrat. Le backend sait répondre à *« peut-elle faire ceci, ici ? »* ; le frontend ne
sait poser que *« qu'est-elle ? »*. Ce sont deux questions différentes, et la seconde donne des
réponses fausses dès qu'une personne a des appartenances multiples : elle est « agent » globalement,
alors qu'elle n'est agent **que dans une agence**.

**Ce que ça ne casse pas.** L'autorisation réelle reste côté serveur. Un front qui affiche un bouton
qu'il ne devrait pas obtient un 403. Le défaut est ergonomique, pas sécuritaire — et c'est pour ça
que la dette a été jugée tenable.

**Ce qui la referme.** Faire descendre les capacités effectives dans la réponse `/me`, et remplacer
les prédicats de rôle par une lecture de capacités scopée par agence. Ce chantier n'est pas ouvert.

**La décision ne vit que dans un docblock.** `src/lib/roles.ts:3-10` porte la seule trace :
« TCK-278 — le contrat HTTP est inchangé ». Un lecteur de `src/types/user.ts`, qui voit
`roles: UserRole[]`, n'a aucune raison de deviner que ce champ est dérivé, ni que le backend n'a
plus de rôles du tout.

## Application

- `src/types/user.ts` — `roles: UserRole[]` dans le contrat.
- `src/lib/roles.ts:14-64` — les 7 prédicats (`isAgent`, `isOwner`, `isAdmin`, `isSuperAdmin`…).
- `src/components/layout/AppSidebar.tsx:57-90` — `buildNavItems(user)`, la navigation construite en
  TypeScript pur à partir des prédicats : pas de descripteur déclaratif, pas de permissions serveur.
- `app/Models/Concerns/HasProfiles.php` — `profileTypes(): Collection<string>`, la dérivation.
- **Aucune garde** ne vérifie que les deux modèles restent cohérents.

## Amendement du 2026-10-23 — `roles` ne compte que les profils actifs de l'agence en jeu

Décision du porteur du 2026-10-23, sur les pistes P176.02 à P176.05 (angle 176 du fichier de
pistes, `docs/plans/2026-10-15-pistes-d-amelioration.md`). Relu sur `pre-dev` 4a12ba515.

**Constat.** `HasProfiles::profileTypes()` empile les types de profil du compte **dans toutes ses
agences** et **quel que soit leur statut**. Les relations `agencyAdminProfiles()`, `agentProfiles()`
et `ownerProfiles()` ne filtrent aucun statut, et `profileRelationExists()` n'en juge aucun. Seul
`super_admin` est déjà jugé actif (`hasActiveSuperAdminProfile()`). Les mesures du 2026-10-23
(tests temporaires, retirés) :

- **P176.02** : pour un agent actif de A et admin actif de B, sous profil actif dans A,
  `GET /api/auth/me` rend `roles = ["agency_admin","agent","customer"]` et `agency_id` = A. Le
  front ouvre alors la section d'agence de A (`isAdmin(user.roles)`). L'API refuse les lectures
  qui suivent : `GET /api/users` → 403.
- **P176.03** : pour un compte dont le seul profil est un `AgencyAdminProfile` `suspended`,
  `roles = ["agency_admin","customer"]` et `agency_id = null`. Le front lui ouvre la section
  d'agence. L'API refuse : `GET /api/users` → 403.
- **P176.04** : pour un admin de A, `GET /api/agencies/{A}/members` sert à la ligne d'un membre
  le rôle `agency_admin` qu'il tient dans B.
- **P176.05** : un drapeau ciblé `{"roles":["agency_admin"]}` atteint un compte dont le seul
  profil d'admin est `suspended` (`FeatureFlagEvaluator::evaluate()` → `true`).
  `AnnouncementResolver::matches` lit `roles` par le même chemin.

[ADR-0031](0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md) § 3 pose déjà la règle :
**un profil non actif ne confère ni capacité, ni périmètre, ni rôle**.
`User::getAgencyIdAttribute()` l'applique (profils actifs seulement). `profileTypes()` ne
l'applique pas.

**Ce qui ne change pas : l'API refuse déjà.** Dans les quatre cas, l'autorisation réelle se juge
côté serveur, par capacité et dans l'agence : c'est la conséquence que cet ADR nommait (« un front
qui affiche un bouton qu'il ne devrait pas obtient un 403 »). Le défaut est un **défaut
d'affichage du front** : une section ouverte, puis des lectures refusées. Pour P176.04 et P176.05,
il y a en plus une donnée d'une autre agence qui sort, et un ciblage qui atteint qui il ne devrait
pas.

**Décision.**

1. **`roles` de `/api/auth/me` (`UserResource`)** contient :
   - les types des profils **actifs** que le compte tient **dans l'agence du profil actif** ;
   - les **types qui ne dépendent pas d'une agence**, quelle que soit l'agence active :
     `service_provider` si le `ServiceProviderProfile` est actif (ce profil n'a pas
     d'`agency_id`, il est lié aux agences par une collaboration), et `tenant`, tiré d'un bail en
     cours (`hasActiveTenantLease()`) — décision du porteur du 2026-10-23 ;
   - `customer`, le plancher ;
   - `super_admin`, si le profil plateforme est actif (c'est déjà le cas).

   Un profil suspendu, archivé ou inactif n'y figure pas. Un profil d'une autre agence non plus.

   **Un compte sans profil actif résolu** (un compte de plusieurs agences sans indice ni cookie, et
   les réponses de connexion d'`AuthController`, `PhoneLoginService` et `OAuthSessionOpener`, qui
   rendent `UserResource::pourSoi`) reçoit les types globaux ci-dessus, `customer` et
   `super_admin` s'il l'est, et aucun type d'agence (décision du porteur du 2026-10-23).
   L'amendement d'[ADR-0004](0004-profil-actif-resolu-par-middleware.md) du même jour fait porter
   l'indice par tout appel, ce qui réduit ce cas à la connexion.
2. **Une variante « actifs seulement » de `profileTypes()`** est la seule source de ce calcul. Elle
   est lue par :
   - `UserResource`, qui la borne à une agence (point 1 et point 4) ;
   - les deux services de ciblage, `AnnouncementResolver::matches` et
     `FeatureFlagEvaluator::evaluate`, pour leur critère `roles`.

   Une annonce ou un drapeau ciblé par rôle n'atteint plus un profil suspendu.

   **Leur critère `agency_ids`** se juge sur **les agences où le compte a un profil actif**, toutes,
   et non plus sur `$user->agency_id`, qui ne suit que l'agence active et vaut `null` pour un compte
   de plusieurs agences sans profil résolu (décision du porteur du 2026-10-23). Une annonce ou un
   drapeau ciblé sur une agence atteint donc chaque membre actif de cette agence, quel que soit
   l'en-tête de profil de la requête.
3. **Les vues super-admin gardent les profils suspendus.** `UserDetailResource` (la fiche d'un
   compte dans la console) et `Admin\AgencyDetailController::team` (l'onglet Équipe d'une agence,
   déjà borné à l'agence lue par TCK-1780) continuent de lire `profileTypes()` tel quel. Un
   opérateur doit voir qu'un compte **a** un profil suspendu : c'est l'objet de ces écrans. ADR-0031
   § 3 range ce cas parmi les sites qui testent une appartenance et non un droit.
4. **Dans les listes de membres d'une agence**, `roles` est rapporté à **l'agence de la route**, et
   non à l'agence du profil actif de chaque membre ni à toutes ses agences. Le site visé est
   `GET /api/agencies/{agency}/members` (`AgencyController::listMembers`, qui rend
   `UserResource`). Un admin de A n'y apprend plus ce qu'un membre tient dans B.

   **Un membre suspendu y garde son type, avec son statut**, pour que l'admin le voie et puisse le
   réactiver (décision du porteur du 2026-10-23). La liste d'équipe teste une appartenance, pas un
   droit : c'est le cas qu'ADR-0031 § 3 range parmi les sites sans filtre de statut. Le type figure
   dans `roles`, et le statut du profil sort à côté, par type (le nom de la clé se fixe au ticket).

   **Les deux réponses d'écriture relevées par P176.04 suivent la même règle** (décision du porteur
   du 2026-10-23) :
   - `POST /api/agencies/{agency}/members` (`UserResource::make($target->refresh())`,
     `AgencyController.php:296`) rapporte `roles` à l'agence de la route ;
   - `PUT /api/users/{user}/role` (`$user->fresh()->profileTypes()`, `UserRoleController.php:91`)
     n'a pas d'agence dans sa route : il rapporte `roles` à l'agence où il vient de poser le rôle
     (`$targetAgencyId`), qui en tient lieu.

**Points tranchés le 2026-10-23.** Le premier jet de cet amendement laissait cinq points ouverts.
Le porteur les a tranchés le jour même, et ils sont écrits plus haut : les types globaux et le
compte sans profil actif (point 1), le critère `agency_ids` du ciblage (point 2), le membre
suspendu et les deux réponses d'écriture (point 4).

**La sortie à terme reste celle de cet ADR.** `roles` reste un contrat de compatibilité. Cet
amendement le rend juste pour l'agence en jeu, sans le faire disparaître. Ce qui ferme la dette
reste ce que § Conséquences nommait : faire descendre dans `/me` les **capacités effectives par
agence**, et remplacer les prédicats de rôle du front par une lecture de ces capacités. Ce chantier
n'est toujours pas ouvert.

**Application.**

- `HasProfiles` gagne la variante « actifs seulement », bornable à une agence. Elle suit
  `ActiveProfileResolver::isActiveProfile()`, la règle que lit déjà `getAgencyIdAttribute()`.
- `UserResource` la lit avec l'agence du profil actif pour `/me`. Pour `listMembers` et
  `addAgent`, il lit les profils de l'agence de la route, tous statuts, avec leur statut.
  `UserRoleController::update` fait de même avec `$targetAgencyId`.
- `AnnouncementResolver` et `FeatureFlagEvaluator` la lisent pour `roles`, et jugent `agency_ids`
  sur l'ensemble des agences où le compte a un profil actif.
- `UserDetailResource` et `AgencyDetailController::team` ne changent pas. Un test garde qu'un
  profil suspendu y apparaît toujours.
- Les tests repartent des quatre mesures ci-dessus et se vérifient par ablation :
  - agent de A et admin de B, sous profil actif dans A : `/me` sans `agency_admin` ;
  - admin suspendu : `/me` sans `agency_admin` ;
  - membre de A et de B : `/members` de A sans le rôle tenu dans B ;
  - drapeau ciblé `agency_admin` : `false` pour un admin suspendu ;
  - compte sans profil actif, prestataire actif et locataire d'un bail en cours : `/me` rend
    `service_provider`, `tenant` et `customer`, sans type d'agence ;
  - agent suspendu de A : `/members` de A le rend avec `agent` et son statut `suspended` ;
  - membre actif de A et de B, profil actif dans B : une annonce ciblée sur A l'atteint.

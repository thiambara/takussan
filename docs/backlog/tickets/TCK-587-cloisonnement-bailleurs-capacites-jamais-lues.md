---
id: TCK-587
title: "Un bailleur lit et modifie les baux, loyers, versements et biens des autres bailleurs de son agence ; supprimer n'est pas jugé par `delete` ; 31 capacités sur 45 ne sont lues par aucun geste"
status: done
phase: P0
family: full
estimate: XL
wave: 73
created: 2026-10-06
updated: 2026-10-07
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#15-transactions--paiements
    - docs/features.md#16-crm--relation-client
    - docs/features.md#112-agence--équipe
    - docs/features.md#110-documents--contrats
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#26-audit--traçabilité
  models:
    - docs/models-spec.md#catalogue-capability-tck-278--tck-279
    - docs/models-spec.md#règle-5--profil--rôle
    - docs/models-spec.md#3-property
    - docs/models-spec.md#28-payout-
tags: [back, front, securite, autorisation, policies, capacites, bailleur, agence, export, equipe, partage, adr-requise]
---

## Objectif utilisateur

- **Bailleur** : je ne vois et ne touche que mes biens, mes baux, mes loyers, mes réservations, mes
  versements et mes documents. Les autres bailleurs de mon agence ne voient rien des miens.
- **Agent** : je ne peux pas supprimer le bien d'un collègue ni un client de l'agence sans en avoir
  le droit, et ce qu'on m'a retiré dans mon rôle est réellement retiré.
- **Admin d'agence** : chaque case de l'éditeur de rôles fait ce qu'elle dit, ou elle dit qu'elle
  ne fait encore rien. Je suspends un membre de *mon* agence sans bannir son compte de toute la
  plateforme, et la suspension lui retire réellement ses droits dans l'agence. Les exports du CRM et des paiements sont réservés à qui en a le droit, et tracés.

## Contexte

Ticket issu de l'**analyse par acteur du 2026-10-06 (vague 73)** : points O1, O2, O3, O15 du
rapport bailleur, A1 du rapport agent, AD2, AD3, AD5, AD6 du rapport admin d'agence. O2 et AD2
sont le même défaut vu de deux côtés. Chaque constat ci-dessous a été **re-mesuré** sur `e3ab4a4e`.

### 1. La clause « même agence » ne regarde pas le type de profil

`User::getAgencyIdAttribute()` (`app/Models/User.php:228-251`) rend l'agence du profil **actif,
quel qu'il soit** — donc aussi d'un `OwnerProfile` (`OwnerProfile.php:24`, colonne `agency_id`).
Les policies accordent lecture et écriture sur `$user->agency_id === $model->agency_id` :

| Fichier | Lignes | Effet pour un bailleur B2 sur les ressources du bailleur B1 |
|---|---|---|
| `LeasePolicy.php` | 64 (`view`), 93 (`update`) | lit et modifie le bail. 114, 137, 169, 200, 221 : même clause, mais suivie de `can('leases.*')` que le rôle bailleur ne tient pas |
| `LeasePaymentPolicy.php` | 32 | gère les loyers |
| `PayoutPolicy.php` | 36, 53 | lit et **marque traité / échoué / annule** le versement (voir §2) |
| `InvoicePolicy.php` | 40, 53 | lit, envoie, marque payée, annule la facture |
| `BookingPolicy.php` | 36, 51 | lit, confirme, rejette la réservation ; l'annule par `view` (`CancelBookingRequest.php:29`) |
| `DocumentPolicy.php` | 83, 88, 97, 103, 111, 117 | lit les documents des biens, baux, réservations, clients, de **l'agence** elle-même (l.111), des états des lieux |
| `InventoryPolicy.php` | 31, 49 | lit et modifie l'état des lieux |
| `PropertyVisitPolicy.php` | 30, 49 | lit et modifie la visite |
| `PropertyPolicy.php` | 52, 111 | lit, modifie, publie, dépublie, **supprime** le bien (voir §3) |
| `CustomerPolicy.php` | 26 | lit et modifie le CRM de l'agence |
| `GuarantorPolicy.php` | 30 | lit, modifie et supprime les garants |

Les listes suivent, par `orWhere('agency_id', $user->agency_id)` : `LeaseController.php:31-37`,
`PayoutController.php:27-33`, `InvoiceController.php:25-31`, `BookingController.php:27-33`,
`InventoryController.php:51-55`, `PropertyController.php:38-41`, et `CustomerController.php:27-37`
(`agency_id = mon agence OR added_by_id = moi` : un bailleur de l'agence liste **tout le CRM**,
téléphones et pièces d'identité compris). Et la clause est recopiée dans six
helpers exemptés par `scripts/check-controller-authorization.mjs` ou voisins :
`LeasePaymentController.php:61` (liste, saisie et marquage des loyers),
`BookingPaymentController.php:109` (paiements d'une réservation),
`DocumentShareLinkController.php:119` (lien de partage public d'un document),
`DocumentPdfController.php:93,113,129` (quittance, facture, contrat en PDF),
`FavoriteController.php:36` (porté par **TCK-599**, qui y appelle `can('view', $property)`),
`ConversationContextController.php:102-104,145-147` (baux et biens proposés comme contexte d'une
conversation). À la création :
`LeaseService.php:25-28` accepte `$user->agency_id && $property->agency_id === $user->agency_id`,
et `StoreLeaseRequest::authorize()` rend `true` (l.26).

*Consolidation* — même clause dans `BookingService::create` (`app/Services/Model/BookingService.php:65-67`) :
`$isStaff` est vrai pour **tout** profil actif de l'agence du bien, `OwnerProfile` compris
(`StoreBookingRequest::authorize()` rend `true`, l.24-27). Pour un bailleur B2 sur un bien de B1,
tracé ligne à ligne :
- l.69-75 : le contrôle « bien public » est sauté — B2 réserve un bien `private`, non publié,
  `pending_review` ou `rejected` de B1 (`scopePublic`, `Property.php:458-473`), et la réponse 201
  lui rend le bien chargé (`BookingController.php:52`) ;
- l.86-91 : `customer_id` est `nullable` (`StoreBookingRequest.php:34`, colonne `nullable`,
  `2026_04_17_160010_create_bookings_table.php:14`) ; un « personnel » qui l'omet n'est pas résolu
  en client : la réservation est créée **sans client**, `pending`, et notifie B1 (l.105-121) ;
- l.78-85 : avec un `customer_id`, B2 réserve au nom de tout client de l'agence, puisque
  `CustomerPolicy::view` porte la même clause (l.26).
Le troisième disjoint (`$property->user_id === $user->id`, l.67) est mort : l.60-63 a déjà refusé
le propriétaire hors super-admin. *Mesure HTTP non rejouée : PostgreSQL du poste injoignable le
2026-10-06 (`SQLSTATE[08006] timeout expired`) ; le chemin est établi par lecture, AC1d le fige.*

Le dépôt a déjà reconnu ce défaut et fermé **deux instances**, pas la classe : la messagerie
(TCK-565, `tests/Feature/Api/ParticipantManagementTest.php:317-321`) et les exports
(`tests/Feature/Dashboard/ExportScopingTest.php:71-81`).

⚠ **Les tests ne voient pas le défaut parce que leurs fixtures le portent.** Le shim
`User::setAgencyIdAttribute()` (`User.php:264-283`) crée un **`OwnerProfile`** :
`User::factory()->create(['agency_id' => X])` — ≥ 155 occurrences dans 110 fichiers de tests —
fabrique un *bailleur*, que les tests nomment souvent `$agent`
(`PayoutTest.php:121+`, `test_issuer_can_mark_processed`).

### 2. Le bénéficiaire d'un versement peut le marquer « traité » (O2 + AD2)

`PayoutPolicy::update` affirme « le bénéficiaire n'est PAS ici » (l.39-44), mais la clause l.53 est
vraie pour un bailleur de l'agence. `MarkProcessedPayoutRequest::authorize()` délègue à
`can('update')` (l.29-31) : `mark-processed`, `mark-failed` et `cancel` (`routes/api/payouts.php`)
lui sont ouverts. Le test `test_landlord_cannot_manage_own_payout` (`PayoutTest.php:110-119`) crée
un bailleur **sans agence** : il ne peut pas rougir sur ce défaut. Côté web, les actions de
`PayoutDetailDialog.tsx:160-186` s'affichent à tout lecteur d'un versement en attente. `view`
(l.36) a le même périmètre : tout membre de l'agence lit tous les versements de tous les bailleurs.
`InvoicePolicy::update` (l.53) ouvre de même `send`, `markPaid` et `cancel`
(`InvoiceController.php:64,74,84`).

### 3. Biens : « Mes biens » = le parc de l'agence ; créer, supprimer et publier ne jugent rien (O3, O15, A1)

- `PropertyController::index` (l.38-41) : `user_id = moi OR agency_id = mon agence`. Le menu du
  bailleur dit « Mes biens » (`AppSidebar.tsx:153-154`) et son tableau de bord ne compte que
  `user_id` (`DashboardOwnerService.php:25`).
- `PropertyPolicy::update` (l.96-121) : auteur OU même agence, sans distinguer `update_own` et
  `update_any` (que son docblock l.79-83 annonce). `destroy`, `publish`, `unpublish`
  (`PropertyController.php:156,164,183`) réutilisent `authorize('update')` ; `updateStatus` et
  `updateVisibility` passent par `can('update')` (`UpdateStatusPropertyRequest.php:31`,
  `UpdateVisibilityPropertyRequest.php:31`) — deux contournements de `publish`.
- `PropertyController::store` (l.63-80) **n'appelle aucune autorisation** et
  `StorePropertyRequest::authorize()` rend `true` (l.31-34) : **tout utilisateur authentifié**,
  client compris, crée un bien.
- `PropertyPolicy::createCapability()` / `deleteCapability()` (l.86-94) déclarent
  `properties.create` / `properties.delete`, mais aucun `authorize('create'|'delete')` n'atteint la
  policy. Le test `BasePolicyTest::test_agent_without_delete_capability_cannot_delete`
  (`tests/Feature/Authorization/BasePolicyTest.php:111-118`) est vert sur une méthode que le
  contrôleur n'appelle pas.
- Le bailleur invité : l'état vide de son tableau de bord pousse « Ajouter un bien » vers
  `/app/properties/new` (`overview/owner/page.tsx:46-50`), la garde `assertCanReachAgentArea` le
  laisse passer (`src/lib/auth/guards.ts:35-38`), mais le menu réserve « Publier un bien » au
  personnel (`AppSidebar.tsx:156-164`) et son rôle système ne porte que `properties.update_own`
  (`SystemRoleCapabilities.php`, `owner()`). Son bien entre au catalogue de l'agence sans relecture.

### 4. Supprimer est jugé par « lire » ou « modifier » (A1)

`CustomerController::destroy` (l.112-116) et `GuarantorController::destroy` (l.63-65) autorisent
par `view` — donc tout membre de l'agence, bailleur compris. `DocumentController::destroy`
(l.111-113) autorise par `update`, qui est la règle la plus étroite du lot (téléverseur seul,
`DocumentPolicy.php:46-65`) : pas de fuite, mais la même incohérence.

### 5. Exports et suspension (AD5, AD3)

- `ExportController::show` (l.39-52) traite agent et admin comme un même « staff » ;
  `ExportDataService::scopeToActor` (l.169-186) les scope tous deux à l'agence. Tout agent exporte
  le CRM entier (téléphone, `id_type`, `id_number`) et tous les encaissements, jusqu'à 50 000 lignes,
  sans capacité et sans trace. La spec (§2.5, « Export CSV / Excel ») réserve l'export à 🛡️.
- `UserAdminController::block` (l.59-77) laisse un admin d'agence poser `users.status = blocked` et
  révoquer tous les jetons du **compte** d'un agent, bailleur ou co-admin : un bailleur confié à deux
  agences est banni de la plateforme par une seule. **`activate` (l.79-93) lève de même un blocage
  posé par le super-admin.** Le bouton vient de `TeamConsole.tsx:185-187`. (Le changement de
  `users.status` est, lui, journalisé : `User` porte `LogsActivity` avec `status` dans `logOnly`,
  `User.php:317-330`.)

### 6. Capacités déclarées, jamais lues (AD6)

Mesuré : le catalogue compte **45** cas (`Capability.php:17-97`). Un cas est « lu » s'il atteint
une décision : `canActAt(Capability::X)`, `can('x.y')`, ou une méthode `*Capability()` de policy
**dont l'ability est effectivement invoquée**. Les noms de route (`->name('properties.publish')`,
`routes/api/properties.php:41`) et la liste blanche de `resolvePlatform()` sont des faux positifs.
**31 cas n'ont aucun lecteur**, dont `properties.create|delete|publish|update_own`, `leases.create`,
`team.suspend`, `crm.view_all|export`, `payments.export|record`, `invoices.send|write_off`,
`payouts.approve`, `bookings.*`. `CapabilityController::index` (l.22-46) les sert tous à l'éditeur
de rôles : un admin qui retire `payouts.approve` à un rôle « Comptable » croit avoir restreint
quelque chose.

### 7. Un membre suspendu garde tous ses droits (passe de correction du 2026-10-06)

Suspendre un agent existe déjà (`PATCH /api/profiles/{agent_profile}/suspend`,
`AgentInvitationService.php:128-156`) et ne lui retire rien :

- `MembershipCapabilityResolver::roleAllows()` (`MembershipCapabilityResolver.php:421-438`) lit
  l'`agency_role_id` de **tout** profil du user dans l'agence, sans filtre de statut — alors que ses
  docblocks annoncent « les profils actifs » (l.61-62, 367-369). Un agent `suspended`, un admin
  `suspended`, un bailleur `blocked` gardent chaque capacité de leur rôle.
- `HasProfiles::isAgentAt()` / `isAgencyAdminAt()` / `isOwnerAt()` (`HasProfiles.php:149-171`) ne
  filtrent que `deleted_at`. Le dépôt le sait : `AgencyController.php:322-327` écrit qu'« un
  administrateur suspendu peut agir sur l'agence » et renvoie la décision à TCK-278 — **clos sans
  l'avoir prise**. 112 appels dans 60 fichiers de `app/` (grep du 2026-10-06), dont
  `AgentInvitationService.php:222` : un co-admin suspendu suspend encore les autres.
- L'auto-bascule (`ResolveActiveProfile.php:125-135`) et le repli de `User::getAgencyIdAttribute()`
  (`User.php:243-250`) retiennent un profil **quel que soit son statut**, alors que le chemin
  explicite refuse un profil non actif (`ActiveProfileResolver.php:99-108`). Un agent suspendu d'une
  seule agence garde donc `agency_id` et, avec lui, chaque clause du §1.
- `TeamManagementTest::test_suspend_flips_status_and_logs_activity` (`TeamManagementTest.php:91`)
  n'affirme que le statut et le journal ; aucun test ne vérifie qu'un suspendu perd un accès.

Conséquence pour la vague : l'expression « équivalente » de la règle commune 3
(`isAgentAt || isAgencyAdminAt`) compte encore les profils suspendus tant que le §7 du Delta n'est
pas fusionné, et la suspension « de l'agence » du §5 serait sans effet sans lui.

### 8. Le mot de passe d'un lien de partage voyage dans l'URL (consolidation du 2026-10-06)

Les deux routes publiques du partage sont des `GET` (`routes/api/documents.php:28-29`) et lisent
le mot de passe par `$request->input('password')` (`DocumentShareLinkController.php:63` pour
`show`, l.88 pour `download`) : sur un `GET`, il ne peut venir que de la query string. Le mot de
passe d'un document protégé s'écrit donc partout où l'URL complète est conservée : journaux
d'accès du proxy, historique du navigateur, lien recopié avec son mot de passe. Les tests l'éprouvent sous cette seule
forme (`DocumentShareLinkTest.php:141`, `DocumentShareLinkDownloadTest.php:181,190`).

Côté web, **aucun appelant ne transmet de mot de passe** : `DocumentShareDialog` le saisit à la
création (l.86, 118) puis distribue `${window.location.origin}/api/share/${token}`
(`DocumentShareDialog.tsx:52-53`) — une URL de l'**origine du front**, où aucun gestionnaire
`src/app/api/share` n'existe et que ni `next.config.ts` ni le proxy ne réécrivent vers l'API. Le
destinataire n'a ni page d'accueil ni formulaire de mot de passe : la seule voie d'un lien protégé
est d'ajouter `?password=` à la main. Le correctif crée donc l'appelant au lieu de l'adapter.

## Contrat de données

Aucune migration de schéma. Endpoints :

- **Modifiés (autorisation seulement)** : toutes les routes des ressources du §1 ; `POST
  /api/properties`, `DELETE /api/properties/{id}`, `POST .../publish|unpublish`, `PUT
  .../status|visibility` ; `DELETE /api/customers|guarantors|documents/{id}` ; `POST
  /api/payouts/{id}/mark-processed|mark-failed|cancel` ; `POST /api/invoices/{id}/send|mark-paid|cancel`
  ; `POST /api/bookings` (§1, bailleur de l'agence = client) ; `POST /api/bookings/{id}/confirm|reject|cancel` ; `GET /api/export/{entity}` ;
  `POST /api/leases/{id}/payments`, `POST /api/lease-payments/{id}/mark-paid` ;
  `PUT /api/properties/{id}/assigned-agent` (422 si la cible n'est pas du personnel actif) ; les
  routes PDF, partage et contexte de conversation du §1. Tout endpoint d'agence : un profil non actif
  n'y confère plus rien (§7).
- **Restreints au super-admin** : `POST /api/users/{user}/block|activate`.
- **Lien de partage (§8)** : nouveaux `POST /api/share/{token}` et `POST /api/share/{token}/download`,
  corps `{ password }` (JSON ou formulaire), mêmes réponses que les `GET` (200 / flux, 401 mot de
  passe absent ou faux, 410). Les `GET` restent pour les liens sans mot de passe ; un `password`
  en query string, sur l'une des quatre routes, rend **400** `errors.share_password_in_query`, avant
  toute lecture du lien. Le 401 d'un lien protégé reste celui de
  `DocumentShareLinkService::validate` (l.38-44), inchangé ici : le front y lit « demander le mot
  de passe ».
- **Nouveaux** : `POST /api/agencies/{agency}/team/{user}/suspend` et `.../reactivate`
  (`Agency\TeamMemberSuspensionController`, `SuspendTeamMemberRequest`) → 200
  `{ data: { user_id, profiles: [{ type, id, status }] } }`.
- **Enrichi** : `GET /api/capabilities` ajoute, à côté de `platform_reserved`,
  `not_enforced: [{ capability, ticket }]` — la forme existante ne bouge pas.
- Le bailleur proposant un bien : `POST /api/properties` rend 201 avec `status = draft`,
  `visibility = private` imposés, quel que soit le corps.

## Direction UX / Artistique

- **Bailleur** : « Mes biens » ne montre que les siens. Là où il pouvait « Ajouter un bien », il
  **propose un bien à son agence** : le vocabulaire, l'état vide du tableau de bord et le formulaire
  disent que l'agence relira et publiera ; aucun bouton « Publier » ne lui est présenté. L'hôte d'une
  agence individuelle garde son parcours actuel.
- **Versement** : les actions « Marquer traité / échoué / Annuler » ne sont présentées qu'à qui peut
  les faire — jamais au bénéficiaire. Le bailleur voit son versement en lecture seule, sans bouton
  grisé qui suggérerait un droit.
- **Équipe** : l'action devient « Suspendre de l'agence » / « Réactiver », avec une confirmation
  qui dit que le compte n'est pas touché. Elle n'est pas proposée sur l'administrateur principal.
- **Éditeur de rôles** : une capacité sans effet porte une mention discrète « sans effet pour
  l'instant », avec une info-bulle ; la case reste cochable (on prépare un rôle). Même famille
  visuelle que la mention « réservée plateforme » existante.
- **Exports** : le bouton n'est proposé qu'à qui détient la capacité de l'entité.
- Textes en `fr` / `en` / `wo`, dans un bloc de clés propre au ticket.

## Contraintes strictes (métier)

1. **ADR avant le code.** Il tranche : (a) la définition du **personnel de l'agence** — profil
   `AgentProfile` ou `AgencyAdminProfile` **actif** (`scopeActive`) dans l'agence **du profil actif**
   (contrat TCK-146, cf. docblock `AgencyPolicy.php:25-33` : le résolveur seul n'exige pas que le
   profil actif soit sur l'agence visée), plus — **option retenue par défaut** — une `RoleDelegation`
   active de rôle `agent` ou `agency_admin` (sans quoi la délégation confère des capacités
   inutilisables) ; (b) qu'à l'intérieur de l'agence, **le bailleur est cloisonné à ses ressources**
   (précision du principe non négociable n° 2) ; (c) l'inventaire des capacités sans lecteur et son
   cliquet ; (d) qu'**un profil non actif ne confère rien** — ni capacité, ni périmètre, ni
   auto-bascule (§7).
2. **Un seul prédicat.** `MembershipCapabilityResolver::staffAgencyId(User $user): ?int` rend
   l'agence du profil actif si le user y est personnel, sinon `null`. Toutes les clauses du §1 le
   lisent ; aucune ne réécrit l'expression. `MessagingReach::isActiveStaffAt()` (l.169-173) y est
   rebranché.
3. **Ce que garde le bailleur** : `landlord_id`, `property.user_id`, `created_by_id`, `issued_by_id`
   — ses propres ressources, rien d'autre. Les collaborateurs d'un bien restent hors périmètre
   (dette O9/B14 consignée par la session).
4. **Le bénéficiaire ne gère jamais son propre versement**, même s'il est aussi personnel
   (`PayoutPolicy::update` refuse `landlord_id === user.id` en tête). **Option retenue par défaut**,
   agence `individual` comprise : l'hôte, à la fois admin et bailleur, ne marque pas ses propres
   versements (un versement à soi-même n'y a pas d'objet) ; à confirmer avec TCK-594.
5. **Options retenues par défaut** (non tranchées par le porteur) :
   - Le bailleur rattaché **propose un bien à son agence** : brouillon privé (`draft` + `private`
     imposés), jamais publiable par lui, publié par le personnel (`properties.publish`) ; les admins
     actifs de l'agence sont notifiés (l'agent principal de TCK-504 s'y ajoutera). Alternative
     écartée : retirer toute création au bailleur.
   - Annuler une facture exige `invoices.write_off` : l'agent du rôle système la perd (conforme à
     §2.5, finance = 🛡️).
   - Exporter le CRM et les paiements exige `crm.export` / `payments.export` : l'agent du rôle
     système les perd (spec §2.5, « Export CSV / Excel »). Alternative écartée : agent limité à ses
     clients (`added_by_id`).
   - Les capacités **sans aucun geste** (`agency.update`, `agency.upgrade_request`,
     `payments.refund`, `messaging.broadcast`, `messaging.archive`) restent au catalogue, inscrites
     à l'inventaire comme dette **D-69** (`docs/ardoise.md`, « Cinq capacités du catalogue ne sont
     jugées par aucun geste ») ; la valeur de leur ligne d'inventaire est `D-69`.
   - Un seul ticket XL ; la découpe 587a (§1-§4, §7) / 587b (§5-§6) reste possible à la planification.
6. **Piège `BasePolicy::delete()`** : avec `deleteCapability() === null`, elle n'accorde qu'au
   super-admin. Passer un `destroy` sur `authorize('delete')` impose de surcharger `delete()` dans
   la policy concernée, sinon le geste est fermé à tous.
7. **Ne pas réparer un test rouge en rouvrant la clause.** Les tests qui rougissent parce que leur
   « agent » est un `OwnerProfile` (§1, shim) se corrigent par `withAgentProfile($agency)` ou un
   profil admin explicite — jamais en rendant au bailleur un accès.
8. **Garde de sécurité prouvée par ablation** (règle 5 de la vague) : chaque test de refus rougit
   sur le code actuel et redevient rouge quand on retire le correctif.
9. **Aucun littéral de prose** (règle 1) : les `abort(403, 'CRM export restricted…')`
   (`ExportController.php:47,52`) et tout message réécrit passent par `__('errors.…')`.
10. **Coordination vague 73** (chaque renvoi vérifié par grep dans le ticket cité, 2026-10-06) :
   - **592** possède `MaintenanceRequestPolicy` (l.33, 51, 103) et `MaintenanceRequestController:43-44`
     — exclus ici ; 592 y applique le prédicat (TCK-592 §Contraintes, AC16 : « un autre bailleur de
     l'agence → 403 »). Il touche aussi, dans le territoire de 587, `SystemRoleCapabilities::serviceProvider()`
     et `MembershipCapabilityResolver::serviceProviderRoleAllows()` seulement ; 587 touche `roleAllows()`
     et ajoute `staffAgencyId()` : conflit de lignes voisines, ordre de fusion indifférent.
   - **590** porte `PropertyVisitController` (l.67-69 `store`, l.234 `feedback` — TCK-590 Contexte
     l.66-70), **597** `ReviewController` (l.225, 245 — TCK-597 Contexte l.56, Contraintes 2),
     **591** `CalendarController:45` (TCK-591 Delta l.283), **599** `FavoriteController:36` (TCK-599
     Contraintes l.263-264, `can('view', $property)`) : ces sites sont inscrits à l'exemption de la garde
     du §1 **au nom de leur ticket**, et chaque ticket retire son exemption dans le commit qui corrige.
     `TaskController:81` n'est pas une fuite de lecture (contrôle du destinataire d'une tâche, docblock
     l.71-74) : exemption au nom de 591 si la garde le détecte.
   - **591** possède `CustomerController` hors `destroy`. **Option retenue par défaut** : 587 ne
     modifie que le bloc `where` d'`index` (l.27-37) — TCK-591 ne le porte pas (grep « index »,
     « added_by_id » : aucun Delta) ; 591 garde le reste du fichier, conflit de lignes voisines.
   - **594** ajoute `PayoutPolicy::approve` et `payouts.approve` ; 587 ne touche que `view`/`update`
     et les actions existantes de `PayoutDetailDialog`. 594 **retire `payouts.approve` et
     `agency.update_billing` de la tolérance** « capacité sans lecteur » dans le commit qui les branche
     (écrit dans TCK-594 §Contraintes, l.344-347, vérifié le 2026-10-06).
   - **`BookingService::create`** (consolidation) : **596** y remplace le `notifyMany` littéral
     (l.105-121) par l'événement `BookingRequested` et y ajoute l'appel
     `PropertyAvailabilityService::assertAvailable` (TCK-596 Delta §2 et §3A) ; **588** n'y change que
     des littéraux (TCK-588 l.143, 195). 587 ne touche que la définition de `$isStaff` (l.65-67) :
     blocs disjoints, ordre de fusion indifférent ; en cas de conflit textuel, la version de 596
     gagne hors l.65-67 (TCK-596 l.300-301).
   - **Lien de partage** (consolidation, §8) : **602** touche `DocumentShareLinkService` (hachage du
     jeton, compteur de mots de passe faux), sa migration et `routes/api/documents.php:28-29`
     (`throttle`) et déclare « le contrôleur reste inchangé » (TCK-602 l.365-369). 587 prend
     `DocumentShareLinkController::show|download` (lecture du mot de passe) et ajoute deux routes
     `POST` voisines des l.28-29 : **elles portent le même `throttle` que leur `GET`** (`30,1` et
     `10,1`), que 602 soit fusionné avant ou après — le second fusionné l'écrit. Les tests de 602 qui
     envoient un mot de passe (AC30) le passent par le corps d'un `POST` si 587 est fusionné avant.
     **TCK-539** (`done`) a déjà fait passer `download` en flux (l.96-99) ; **ADR-0029** ne cite pas
     ce contrôleur (grep) : aucune coordination.
   - **595** ajoute des types d'export : chacun déclare sa capacité dans la table d'export de 587.
     595 touche `PropertyController::index` (eager-loading) : 587 n'y touche que la clause `where`.
   - **596** possède `InventoryController` (show, suppression) : 587 n'y touche que le `where`
     d'`index` (l.42-56). 596 prend `RefundBookingPaymentRequest` ; 587 ne touche, dans
     `BookingPaymentController`, que `authorizeBookingAccess` (l.102-112). **601** affiche l'entrée de
     journal d'export ; 587 l'écrit. **600** possède `UserAdminController::destroy` et
     `/api/admin/users/*`.
   - **586** possède les parties courtier de `HasProfiles` et `User.php:162` ; 587 ne touche, dans
     `HasProfiles`, que `isOwnerAt/isAgentAt/isAgencyAdminAt` (l.149-171), dans `User.php` que le
     repli d'`getAgencyIdAttribute()` (l.243-250), et dans `AgencyController` que le commentaire
     l.322-330 (586 : l.332-337, 592 : l.338-343). `ResolveActiveProfile` et `ActiveProfileResolver`
     ne sont dans aucun territoire : 587 n'y change que le filtre de statut de l'auto-bascule.
   - **Inventaire et ordre de fusion.** Tout ticket qui branche une capacité **retire sa ligne de
     l'inventaire dans le même commit**. Si ce ticket-là est fusionné **avant** 587, 587 ne l'inscrit
     pas : l'inventaire se dresse à l'implémentation depuis l'état mesuré de `dev`, jamais depuis la
     table du §6 recopiée. C'est le cas attendu pour **`maintenance.assign` / `maintenance.close`**,
     tolérées au nom de **TCK-592** (TCK-592 AC17 leur donne un lecteur) ; de même `crm.assign`
     (590 et 591 la lisent tous deux : le premier fusionné retire la ligne), `team.remove` (591),
     `leases.sign` et `bookings.refund` (596, AC11 et `RefundBookingPaymentRequest`),
     `payouts.approve` et `agency.update_billing` (594), `agency.update_kyc` (601, AC9b).

## Delta à produire

### 0. Décision
- [x] ADR (prochain numéro libre) « Le personnel de l'agence et le cloisonnement des bailleurs ;
      capacités sans lecteur » — accepté avant le code (contrainte 1).

### 1. Cloisonnement
- [x] `MembershipCapabilityResolver::staffAgencyId()` + `User::staffAgencyId()` (proxy) ; tests
      unitaires : agent actif, agent suspendu, admin, bailleur seul, bailleur + agent même agence,
      multi-agences sans profil actif, délégation active / échue.
- [x] Policies : `Lease` (7 clauses), `LeasePayment`, `Payout` (`view`/`update`), `Invoice`,
      `Booking`, `Document` (6 branches dont `Agency`), `Inventory`, `PropertyVisit`, `Property`,
      `Customer`, `Guarantor` → prédicat.
- [x] `index` : `LeaseController`, `PayoutController`, `InvoiceController`, `BookingController`,
      `InventoryController` (bloc `where` seul), `PropertyController` (bailleur : `user_id` seul),
      `CustomerController` (bloc `where` l.27-37 seul : personnel avec `crm.view_all` → l'agence ;
      sinon `added_by_id = moi`), aligné sur `CustomerPolicy::view` du §4.
- [x] Helpers : `LeasePaymentController::authorizeLeaseAccess`,
      `BookingPaymentController::authorizeBookingAccess`, `DocumentShareLinkController::authorizeDocument`,
      `DocumentPdfController::authorize{Receipt,Invoice,Lease}` → délégation à la policy du modèle
      quand la règle est identique (et retrait de leur entrée `EXEMPTIONS_JUSTIFIEES`), sinon
      prédicat (la quittance garde sa branche collaborateur, `DocumentPdfController.php:94-97`).
      `ConversationContextController:102-104,145-147` → prédicat. (`FavoriteController:36` : TCK-599.)
- [x] `LeaseService::create` : `property.user_id === user` OU (personnel de l'agence du bien ET
      `leases.create`).
- [x] `BookingService::create` (l.65-67, *consolidation*) : `$isStaff = $user->isSuperAdmin() ||
      ($property->agency_id !== null && $user->staffAgencyId() === $property->agency_id)`. Le disjoint
      mort `$property->user_id === $user->id` disparaît. Un bailleur de l'agence suit dès lors le
      chemin du client : bien public exigé (l.69-75), `customer_id` absent résolu en son propre
      client (l.86-91), `customer_id` d'un tiers refusé (l.85, l.94). Rien d'autre dans la méthode
      (contrainte 10, 596 / 588).
- [x] Garde `scripts/check-agency-scope-clause.mjs` : interdit, sous `app/Policies`,
      `app/Http/Controllers`, `app/Services`, toute comparaison de `$user->agency_id` à un
      `->agency_id` et tout `where|orWhere('…agency_id', $user->agency_id)`, sauf instruction qui
      appelle aussi `isAgencyAdminAt(` ou le prédicat ; exemptions `fichier::méthode → TCK-NNN`
      refusées si mortes ; cliquet **bilatéral** sur leur nombre ; s'auto-éprouve à chaque
      invocation sur ≥ 5 formes d'écriture (espacée, `!==`, `&&` en tête, `orWhereHas` imbriqué,
      `$actor->`).
- [x] Tests : `tests/Feature/Authorization/OwnerIsolationWithinAgencyTest.php` — une agence, deux
      bailleurs B1/B2 (chacun bien, bail, loyer, réservation, versement, facture, document, état des
      lieux, visite, client ajouté), un agent. Fournisseur de données par endpoint : B2 → 403 sur
      `show`/`update` de chaque ressource de B1 et absent de chaque `index` ; agent → 200.

### 2. Versements et factures
- [x] `PayoutPolicy::view` : bénéficiaire, émetteur, ou personnel tenant `payouts.create`.
      `update` : refus si bénéficiaire ; sinon émetteur personnel ou personnel tenant `payouts.create`.
- [x] `InvoicePolicy` : abilities `send` (`invoices.send`), `markPaid` (`payments.record`), `cancel`
      (`invoices.write_off`), toutes réservées au personnel ; `InvoiceController` les invoque.
- [x] `LeasePolicy::recordPayment` : bailleur du bail, ou personnel de l'agence du bail tenant
      `payments.record` ; `StoreLeasePaymentRequest::authorize()` (l.30-33) et
      `MarkPaidLeasePaymentRequest::authorize()` (l.29-32), qui jugent aujourd'hui par `update`,
      l'invoquent.
- [x] `PayoutTest::test_landlord_of_same_agency_cannot_manage_own_payout` (bailleur AVEC profil
      dans l'agence, sur les trois transitions) ; l'ancien test sans agence reste.
- [x] Web : actions du détail d'un versement conditionnées à la capacité (via `useCan`) et au fait
      de ne pas être le bénéficiaire.

### 3. Biens
- [x] `PropertyPolicy::create` : `properties.create` dans l'agence du profil actif, OU bailleur
      actif de cette agence (**proposition** : le contrôleur impose `draft` + `private`).
      `update` : auteur personnel ou bailleur → `properties.update_own` ; autre bien de l'agence →
      `properties.update_any`. `delete` : `properties.delete` dans l'agence du bien. Nouvelle ability
      `publish` : `properties.publish`.
- [x] `PropertyController` : `authorize('create', Property::class)` en tête de `store` ;
      `destroy` → `delete` ; `publish`/`unpublish` → `publish`. `UpdateVisibilityPropertyRequest`
      (→ `public`) et `UpdateStatusPropertyRequest` (→ `available`/`published`) exigent aussi `publish`.
- [x] Proposition du bailleur (contrainte 5, option retenue par défaut) : notification
      `PropertyProposedNotification` (canal `database`) à chaque admin **actif** de l'agence, par clé
      `__('notifications.property_proposed…')` ; le bailleur ne peut ensuite ni la publier ni la
      rendre publique (`publish`, `PUT …/visibility`, `PUT …/status` → 403).
- [x] Web : « Mes biens » du bailleur = ses biens ; « Proposer un bien à mon agence » remplace
      « Ajouter un bien » pour le bailleur non-personnel (menu, état vide, formulaire sans publication).
- [x] `PropertyController::assignAgent` (l.238-258) : la cible doit être du **personnel actif** de
      l'agence du bien (prédicat appliqué à la cible), sinon 422 `messages.target_user_not_in_active_agency`
      — aujourd'hui `$target->agency_id === $agencyId` (l.248) laisse passer un bailleur, qui devient
      `properties.user_id`. Règle exposée en une méthode que le `bulk-assign` de TCK-591 réutilise.
- [x] Tests `tests/Feature/Api/PropertyAuthorizationTest.php`.

### 4. Suppressions
- [x] `CustomerPolicy::delete` : auteur personnel, ou personnel tenant `crm.view_all` ;
      `CustomerPolicy::view` : auteur, ou personnel avec `crm.view_all` (sinon ses seuls clients).
      `GuarantorPolicy::delete` : auteur, ou personnel de l'agence de l'auteur.
      `DocumentPolicy::delete` = règle actuelle d'`update` (comportement constant).
- [x] `destroy` de `Customer`, `Guarantor`, `Document` → `authorize('delete', …)`.
- [x] `BookingPolicy` : abilities `validate` (`bookings.validate` pour le personnel ; propriétaire du
      bien) et `cancel` (client de la réservation, propriétaire du bien, ou personnel avec
      `bookings.cancel`) ; `confirm`/`reject` → `validate`, `CancelBookingRequest` → `cancel`.
- [x] Tests `tests/Feature/Api/DestroyAuthorizationTest.php` (HTTP, pas d'appel direct de policy).

### 5. Exports et suspension
- [x] `ExportController::show` : table entité → capacité (`customers` → `crm.export`, `payments` →
      `payments.export`, `leases`/`properties` → `reports.export` pour le personnel ; le bailleur
      garde l'export de **ses** biens et baux) ; contrôle en tête, avant toute requête.
      `ExportDataService::scopeToActor` lit le prédicat.
- [x] Journal : `activity('export')` événement `data_exported`, propriétés `entity`, `filters`,
      `row_count`, `agency_id`.
- [x] `UserAdminController::block|activate` : super-admin seul.
- [x] `Agency\TeamMemberSuspensionController` + `SuspendTeamMemberRequest` (`team.suspend` dans
      l'agence de la route = agence du profil actif) + `App\Services\Membership\TeamMemberSuspensionService` :
      suspend **tous** les profils de la cible dans l'agence (agent → `suspended` via
      `AgentInvitationService::suspend`, admin → `suspended`, bailleur → `blocked`), refuse
      `primary_admin_id` et soi-même (422), révoque les jetons dont le profil actif est dans
      l'agence, journalise ; `reactivate` symétrique.
- [x] Web : « Suspendre de l'agence » / « Réactiver » dans la console d'équipe ; la console
      super-admin garde le blocage de compte.
- [x] Tests `tests/Feature/Api/ExportCapabilityTest.php`,
      `tests/Feature/Api/Agency/TeamMemberSuspensionTest.php`.

### 6. Capacités sans lecteur
- [x] `App\Services\Membership\CapabilityEnforcementInventory` : `const AWAITING` — une ligne par
      capacité sans lecteur, valeur = ticket qui la branche. État visé à la fusion de 587 (16 lignes) :

      | Capacité | Valeur | Preuve que le ticket la branche |
      |---|---|---|
      | `maintenance.assign`, `maintenance.close` | TCK-592 | TCK-592 AC17 |
      | `payouts.approve`, `agency.update_billing` | TCK-594 | TCK-594 Delta 3a, l.387 |
      | `bookings.refund`, `leases.sign` | TCK-596 | TCK-596 AC11, `RefundBookingPaymentRequest` |
      | `team.remove` | TCK-591 | TCK-591 Delta (« autorisation par `team.remove` ») |
      | `crm.assign` | TCK-590 / TCK-591 | les deux la lisent ; le premier fusionné retire la ligne |
      | `agency.update_kyc` | TCK-601 | TCK-601 AC9b |
      | `properties.moderate`, `reports.view_global` | réservée plateforme | `Capability::platformReserved()` (l.130-136) ; gestes sous `EnsureSuperAdmin` ; leur sort relève de l'ADR A de TCK-600 |
      | `agency.update`, `agency.upgrade_request`, `payments.refund`, `messaging.broadcast`, `messaging.archive` | dette D-69 | aucun geste ne les lit : `AgencyPolicy` refuse `agency.update` à dessein (l.25-33), `AgencyUpgradeRequestPolicy` juge par `isAgencyAdminAt` (l.101-104), aucune route de remboursement de loyer ; consignées en **D-69** de `docs/ardoise.md` |

      **Tolérance et ordre de fusion** (contrainte 10) : une ligne n'est inscrite que si la capacité
      est sans lecteur **sur `dev` au moment de l'implémentation**. En particulier
      `maintenance.assign` / `maintenance.close` sont tolérées au nom de TCK-592 tant que 592 n'est
      pas fusionné, et absentes de l'inventaire s'il l'est déjà — la garde refuse « lue et
      inventoriée ». Les 15 autres sans lecteur aujourd'hui sont branchées par ce ticket (§1-§5) :
      `properties.create|update_own|delete|publish`, `leases.create`, `bookings.validate|cancel`,
      `invoices.send|write_off`, `payments.record|export`, `crm.view_all|export`, `reports.export`,
      `team.suspend`.
- [x] Garde `scripts/check-capability-readers.mjs` (rejouée par `repo-ci.yml`) : chaque cas de
      l'enum est **soit** lu (définition du §6 du Contexte, `*Capability()` compté seulement si
      l'ability est invoquée pour ce modèle), **soit** dans l'inventaire — jamais les deux, jamais
      aucun. Cliquet bilatéral sur la taille. S'auto-éprouve à chaque invocation sur des extraits
      figés (≥ 5 formes, dont nom de route, docblock, déclaration `deleteCapability()` non atteinte).
- [x] `CapabilityController::index` : `not_enforced` lu depuis l'inventaire.
- [x] Web : mention « sans effet pour l'instant » dans l'éditeur de rôles.
- [x] Tests `tests/Feature/Authorization/BranchedCapabilitiesTest.php` : un fournisseur de données
      par capacité branchée (AC12).

### 7. Profils non actifs (passe de correction)
- [x] `MembershipCapabilityResolver::roleAllows()` : ne lit que les profils `->active()` (scopes
      `AgentProfile.php:68`, `AgencyAdminProfile.php:66`, `OwnerProfile.php:75`) ; docblocks l.61-62
      et 367-369 rendus vrais. `staffAgencyId()` (§1) applique la même condition.
- [x] `HasProfiles::isOwnerAt/isAgentAt/isAgencyAdminAt` : ajoutent `->active()`. Les sites qui
      testent une **appartenance** et non un droit (doublon d'invitation, réactivation, liste
      d'équipe) passent sur une variante explicite `hasProfileAt(AgencyRoleBaseType $type, int $agencyId)`
      sans filtre de statut ; l'inventaire des 112 appels est fait à l'implémentation, chaque site
      classé « droit » ou « appartenance » dans la PR.
- [x] `ResolveActiveProfile::handle` (auto-bascule, l.125-135) et `User::getAgencyIdAttribute()`
      (repli, l.243-250) : ne retiennent que les profils actifs — même règle que le chemin explicite
      (`ActiveProfileResolver.php:99-108`).
- [x] `AgencyController.php:322-330` : le commentaire est réécrit (la visibilité reste sans filtre
      de statut, délibérément : un membre suspendu voit l'agence sans y agir).
- [x] Tests `tests/Feature/Authorization/InactiveProfileGrantsNothingTest.php` (AC13).

### 8. Lien de partage : le mot de passe hors de l'URL (consolidation)
- [x] `routes/api/documents.php` : `Route::post('share/{token}', …'show')` et
      `Route::post('share/{token}/download', …'download')`, noms `share.show.post` /
      `share.download.post`, même `throttle` que le `GET` correspondant (contrainte 10, 602).
- [x] `DocumentShareLinkController::show|download` : refus **400** `__('errors.share_password_in_query')`
      si `$request->query->has('password')`, en tête, avant `validate()` ; le mot de passe se lit par
      `$request->post('password')` (corps seul : formulaire ou JSON) — plus jamais par `input()`.
      Le reste des deux méthodes est inchangé.
- [x] Clé `errors.share_password_in_query` en `fr` / `en` / `wo`.
- [x] Tests : `DocumentShareLinkTest.php:141` et `DocumentShareLinkDownloadTest.php:181,190`
      réécrits en `POST` avec mot de passe dans le corps ; nouveau
      `tests/Feature/Api/DocumentShareLinkPasswordTransportTest.php` (AC15).
- [x] Web (intentionnel) : une **page publique de réception** d'un lien de partage, sur l'origine
      du front, hors de `/app` : elle affiche le nom et la taille du document (`GET`), demande le mot
      de passe quand l'API rend 401, l'envoie par `POST` dans le corps et déclenche le
      téléchargement sans jamais placer le mot de passe dans une URL. `DocumentShareDialog` distribue
      l'URL de cette page (`buildShareUrl`, l.51-54), plus `…/api/share/{token}` sur l'origine du
      front, qui ne répond pas. Textes `fr` / `en` / `wo` ; états lien expiré / révoqué / épuisé (410)
      et mot de passe faux (401) nommés.
- [x] Test de composant de la page (AC15).

## Critères d'acceptation

- [x] **AC1** — `OwnerIsolationWithinAgencyTest` : pour chacune des 11 ressources du §1, un bailleur
      **ayant un profil dans la même agence** reçoit 403 sur la ressource d'un autre bailleur et ne la
      trouve dans aucune liste (`GET /api/customers` compris : le client ajouté par B1 en est absent
      pour B2) ; l'agent de l'agence reçoit 200. Le test rougit sur `e3ab4a4e`, et redevient rouge si
      l'on rétablit la clause `agency_id === agency_id` dans **une seule** policy ou dans le `where`
      d'**un seul** `index`.
- [x] **AC1b** — Même fixture, chemins hors policy : B2 reçoit 403 sur `GET /api/leases/{bail de B1}/payments`,
      `POST /api/leases/{bail de B1}/payments`, `GET /api/bookings/{réservation de B1}/payments`,
      `POST /api/documents/{document de B1}/share`, `GET /api/leases/{bail de B1}/receipts/{p}/pdf`,
      `GET /api/leases/{bail de B1}/contract/pdf`, `GET /api/invoices/{facture de B1}/pdf` ; et
      `GET /api/conversations/context/leases` / `…/properties` ne lui rendent **aucun** identifiant de
      B1 (ensemble attendu = ceux de B2). L'agent reçoit 200 partout. Rougit aujourd'hui (200 / 201) ;
      rouge à nouveau si l'on rétablit la clause dans un seul helper.
- [x] **AC1c** — `POST /api/leases` sur le bien de B1 : B2 → 403 (201 aujourd'hui,
      `LeaseService.php:25-28`) ; un agent dont le rôle personnalisé n'a pas `leases.create` → 403 ;
      B1 et l'agent du rôle système → 201.
- [x] **AC1d** — `POST /api/bookings` (corps : `property_id`, dates, **sans** `customer_id`), même
      fixture : B2 sur un bien `private` de B1 → **403** (201 aujourd'hui, réservation sans client) ;
      B2 sur un bien public de B1 → 201 avec `data.customer_id` = l'identifiant du client de B2 (et
      non `null` comme aujourd'hui) ; B2 avec `customer_id` d'un client ajouté par l'agent → 403 ;
      l'agent de l'agence sur le bien `private` → 201. Rouge à nouveau si l'on rétablit
      `$user->agency_id === $property->agency_id` dans `$isStaff`.
- [x] **AC2** — Un bailleur bénéficiaire, profil actif dans l'agence émettrice, reçoit 403 sur
      `mark-processed`, `mark-failed` et `cancel` de **son** versement ; un agent sans
      `payouts.create` (rôle personnalisé) reçoit 403 ; un agent du rôle système, 200.
- [x] **AC3** — `POST /api/properties` : client sans profil → 403 ; bailleur invité → 201 avec
      `status = draft` et `visibility = private` même si le corps demande `available`/`public` ;
      agent → 201. Rougit sur le code actuel (client → 201 aujourd'hui). Sur ce brouillon, le
      bailleur reçoit ensuite 403 sur `publish`, sur `PUT …/visibility` → `public` et sur
      `PUT …/status` → `available` ; chaque admin actif de l'agence a exactement une notification
      `property_proposed` portant l'identifiant du bien, l'admin suspendu aucune.
- [x] **AC4** — Un agent du rôle système reçoit 403 sur `DELETE /api/properties/{id}` d'un bien d'un
      collègue (il ne tient pas `properties.delete`) et 403 sur `PATCH` de ce bien (pas
      `update_any`) ; l'admin d'agence reçoit 204 / 200. Un rôle sans `properties.publish` reçoit 403
      sur `publish`, **et** sur `PUT .../visibility` vers `public`, **et** sur `PUT .../status` vers
      `available`.
- [x] **AC5** — Un bailleur de l'agence reçoit 403 sur `DELETE /api/customers/{id}` et
      `/api/guarantors/{id}` d'un client de l'agence qu'il n'a pas ajouté (204 aujourd'hui) ; l'auteur
      du document le supprime toujours (204), un autre membre de l'agence non (403). Ablation : sans la
      surcharge de `delete()` (contrainte 6), l'auteur reçoit 403 et le test rougit.
- [x] **AC5b** — `PUT /api/properties/{id}/assigned-agent` par B1 sur son bien avec `user_id` = B2
      (bailleur de la même agence) → 422 et `properties.user_id` inchangé (200 aujourd'hui) ; vers un
      agent actif de l'agence → 200 ; vers un agent suspendu → 422.
- [x] **AC6** — `GET /api/export/customers` : agent du rôle système → 403 ; admin → 200 **et** une
      ligne `activity_log` `data_exported` avec `row_count` égal au nombre de lignes rendues. Même
      chose pour `payments` avec `payments.export`. Le bailleur exporte ses biens : uniquement les
      siens (valeur attendue, pas une longueur).
- [x] **AC7** — Un admin d'agence reçoit 403 sur `POST /api/users/{id}/block` **et** sur
      `/activate` d'un compte bloqué par le super-admin. `POST /api/agencies/{a}/team/{u}/suspend`
      sur un bailleur présent dans deux agences : son profil de l'agence A passe `blocked`, son
      `users.status` reste `active`, il se connecte et agit dans l'agence B. Sur `primary_admin_id` →
      422. Une ligne d'activité est écrite.
- [x] **AC8** — `check-capability-readers.mjs` sort en 0 sur la branche, et en 1 : si l'on ajoute un
      cas à l'enum sans lecteur ni ligne d'inventaire ; si l'on branche une capacité inventoriée sans
      retirer sa ligne ; si l'on retire une ligne sans baisser le cliquet. Lancée sur `e3ab4a4e`,
      elle classe `properties.delete`, `properties.create`, `leases.create` et `properties.publish`
      **sans lecteur** et `invoices.create`, `payouts.create` **lus**. Elle sort aussi en 1 quand une
      capacité est **à la fois** lue et inventoriée — cas éprouvé sur un extrait figé où
      `maintenance.assign` est lue par `MaintenanceRequestController` et inscrite au nom de TCK-592.
- [x] **AC9** — `check-agency-scope-clause.mjs` sort en 1 si l'on réintroduit
      `$user->agency_id === $model->agency_id` dans `LeasePolicy::view`, sous chacune des cinq formes
      de son auto-épreuve.
- [x] **AC10** — `GET /api/capabilities` rend `not_enforced` contenant exactement les lignes de
      l'inventaire, et l'éditeur de rôles affiche la mention sur `payouts.approve` (test de composant).
- [x] **AC11** — Le bailleur ne voit pas les actions d'un versement ; l'admin d'agence les voit
      (test de composant sur les deux cas).
- [x] **AC12** — `BranchedCapabilitiesTest`, une ligne par capacité branchée : un membre dont le
      rôle personnalisé est le rôle système qui la porte **moins elle** reçoit 403 ; le rôle système,
      2xx. Rouge aujourd'hui sur chaque ligne (2xx sans la capacité), rouge à nouveau si l'on retire
      la lecture d'une seule.

      | Capacité | Geste |
      |---|---|
      | `bookings.validate` | `POST /api/bookings/{id}/confirm`, `…/reject` |
      | `bookings.cancel` | `POST /api/bookings/{id}/cancel` (personnel) |
      | `invoices.send` / `invoices.write_off` / `payments.record` | `POST /api/invoices/{id}/send` / `…/cancel` / `…/mark-paid` |
      | `payments.record` | `POST /api/leases/{id}/payments`, `POST /api/lease-payments/{id}/mark-paid` (personnel) |
      | `crm.view_all` | `GET /api/customers/{client d'un collègue}` → 403, et absent de `GET /api/customers` |
      | `properties.update_own` | `PATCH /api/properties/{son bien}` |
      | `crm.export` / `payments.export` / `reports.export` | `GET /api/export/{customers|payments|leases}` |
      | `team.suspend` | `POST /api/agencies/{a}/team/{u}/suspend` |
      | `properties.create|delete|publish`, `leases.create` | AC3, AC4, AC1c |
- [x] **AC13** — `InactiveProfileGrantsNothingTest` : après `PATCH /api/profiles/{agent}/suspend`,
      l'agent (une seule agence) reçoit 403 sur `GET /api/leases/{bail de l'agence}` et ne voit plus
      aucun bail de l'agence dans `GET /api/leases` (200 et la liste entière aujourd'hui) ; un co-admin
      `suspended` reçoit 403 sur `PATCH /api/profiles/{autre agent}/suspend` (200 aujourd'hui,
      `AgentInvitationService.php:222`). Réactivé, chacun retrouve l'accès. Le test rougit si l'on
      retire `->active()` de `roleAllows()`, de `isAgencyAdminAt()` **ou** de l'auto-bascule — chacun
      seul.
- [x] **AC14** — Console d'équipe (test de composant) : un admin d'agence ne se voit plus proposer le
      blocage du **compte** ; « Suspendre de l'agence » est proposé sur un agent ou un bailleur, jamais
      sur l'administrateur principal. Formulaire d'un bailleur non-personnel : aucun contrôle de
      publication ni de visibilité publique.
- [x] **AC15** — `DocumentShareLinkPasswordTransportTest`, sur un lien protégé par `secret1234` :
      `GET /api/share/{t}?password=secret1234` → **400** (200 aujourd'hui) et
      `GET /api/share/{t}/download?password=secret1234` → **400** (flux aujourd'hui), sans incrément de
      `downloads_count` ; `POST /api/share/{t}` corps `{password: "secret1234"}` → 200 ;
      `POST …/download` même corps → 200 en flux, `downloads_count` = 1 ; `POST` corps
      `{password: "faux"}` → 401 ; `POST /api/share/{t}?password=secret1234` sans corps → 400. Un lien
      sans mot de passe s'ouvre toujours en `GET` → 200. Rouge à nouveau si `post('password')`
      redevient `input('password')` (le `POST` avec query passe en 200) ou si le refus de la query
      est retiré. Test de composant de la page de réception : sur un 401, le champ mot de passe
      apparaît et la requête suivante est un `POST` dont l'URL ne contient pas le mot de passe ;
      `DocumentShareDialog` copie une URL qui ne commence pas par `${origin}/api/`.

## Hors périmètre

- `MaintenanceRequestPolicy` et le contrôleur de maintenance (TCK-592).
- Lecture des biens par les collaborateurs, rôles `co_owner` / `viewer` (dette O9/B14).
- Approbation à quatre yeux et `payouts.approve` (TCK-594) ; remboursement d'une réservation et
  `bookings.refund` (TCK-596). `payments.refund` n'a aucun geste : dette **D-69** (contrainte 5).
- Le chiffrement du RIB et des pièces du bailleur (TCK-601), la journalisation du `catch` de
  `PropertyController::store` (TCK-601).
- Suppression de capacités du catalogue : l'inventaire les signale, il ne les retire pas.
- Un statut dédié « proposé à l'agence » : la proposition est un brouillon privé.

## Notes d'implémentation

Mesures prises sur la branche `feat/tck-587-cloisonnement-bailleurs`, base `dev` = `32dd0b39`,
le 2026-10-07.

### Étape 1 — §1 à §4 et §7 (back)

**Prédicat.** `MembershipCapabilityResolver::staffAgencyId()` / `isStaffAt()` (profil agent ou
admin `->active()`, ou délégation active `agent`/`agency_admin`), relais `User::staffAgencyId()`,
et `BasePolicy::isStaffOf()` pour les policies. `StaffAgencyIdTest` : 9 cas.

**Inventaire des 112 appels `isOwnerAt|isAgentAt|isAgencyAdminAt`** (re-mesuré, même compte que
l'analyse). Passés sur `hasProfileAt()` parce qu'ils testent une **appartenance** :
`UserAdminController` (appartenance de la cible), `AgencyMemberRoleController`,
`UserRoleController`, `AgencyController::removeAgent` (dernier admin), `RoleDelegationService`
(profils natifs), `PayoutService` (bailleur de l'agence), `Me/MeCapabilityController` (membre).
Tous les autres sont des **droits** et lisent désormais `->active()`.
`AgencyController.php` : le commentaire visé est aux lignes 322-333 (décalé de trois lignes).

**Sites qui fuyaient au-delà de la liste du ticket**, fermés par le même prédicat :
`MediaPolicy::viewRaw`, `BookingPaymentPolicy`, `PropertyModerationPolicy::resubmit`,
`PaymentController` (historique, deux endroits, et ses deux helpers d'autorisation),
`CustomerNoteController` (helper → `authorize('view', $customer)`), `InvoiceService`,
`InventorySignatureService`, `PipelineStatsService` (personnel + `crm.view_all`),
`KpiConfigController::index` / `ThresholdAlertController::index` (un bailleur reçoit 403),
`IntegrationController` / `InvitationController` (périmètre visible),
`StoreDocumentShareLinkRequest`, `AuthorizesTransitionally::canManageBooking`. La garde
`check-agency-scope-clause.mjs` couvre donc aussi `app/Http/Requests` (le ticket ne nommait que
policies, contrôleurs et services : une clause dans un `authorize()` de requête y échappait).

**Garde `scripts/check-agency-scope-clause.mjs`** (Repo CI) : 574 fichiers, 0 violation ; 18 cas
d'auto-épreuve. Exemptions nommées, cliquet bilatéral à **10** : `MaintenanceRequestPolicy::view|update|isPrincipalFor`,
`MaintenanceRequestController::index` (TCK-592), `PropertyVisitController::store|feedback`
(TCK-590), `ReviewController::reply|deleteReply` et `ReplyReviewRequest::authorize` (TCK-597),
`FavoriteController::store` (TCK-599). `check-controller-authorization.mjs` : 5 exemptions
retirées (les helpers remplacés par la policy), 12 restantes.

**Écarts de règle assumés** (lus dans le Delta, précisés à l'implémentation) :
- un client (`CustomerPolicy::delete`) ou une facture (`InvoicePolicy::send|markPaid|cancel`)
  **sans agence** reste à son auteur / émetteur — aucun rôle ne peut y porter de capacité (même
  règle que le bien sans agence). Une facture sans agence ne s'obtient pas par un bailleur :
  créer exige `invoices.create` ;
- l'auteur bailleur d'un client d'agence le **lit** mais ne le **supprime** pas (« auteur
  personnel ») ;
- l'agent du rôle système ne supprime plus **son propre** bien (`properties.delete` n'est pas dans
  son rôle) — conséquence de « `delete` : `properties.delete` dans l'agence du bien » ;
- `PropertyProposedNotification` passe par `AppDatabaseChannel` : la classe est ajoutée à
  `AppDatabaseChannel::TYPES` (`System`), sans quoi le canal lève.
- `PropertyVisitController::index` n'a jamais porté de périmètre d'agence : le personnel n'y voit
  que ce qui le désigne. Ce n'est pas une fuite ; non modifié (le test du personnel l'exclut).

**Fixtures corrigées** (bailleur nommé agent, ou compte sans profil qui créait un bien) — jamais en
rendant un accès : `PayoutTest` (4), `PaymentGatewayVerifyTest`, `PropertyCrudTest` (4),
`PropertyResourceRawFlagTest` (2), `CustomerPipelineTest` (2), `MediaPolicyTest`,
`MigratedAuthorizationRulesTest` (émetteur d'un versement), `MessagingContactsTest` (un profil non
actif ne donne plus d'agence : l'assertion de fixture s'inverse). Aide `Tests\Concerns\CreatesAgencyMembers`
(`agencyAgent`, `agencyAdmin`, `agentWithout(...)` = rôle système moins des capacités).

**Ablations** (chacune : vert avec le correctif, rouge sans, fichier restauré et vérifié) :

| Retrait | Test | Résultat |
|---|---|---|
| `LeasePolicy::view` → `$user->agency_id === $model->agency_id` | `OwnerIsolationWithinAgencyTest` (refus) | rouge, 200 au lieu de 403 |
| `LeaseController::index` → `$user->agency_id` | idem (listes) | rouge, le bail de B1 dans la liste de B2 |
| `LeasePaymentController::index` → ancien helper | idem (hors policy) | rouge |
| `LeaseService::create` → `$user->agency_id` | bailleur dont le rôle porte `leases.create` | rouge, 201 |
| `LeaseService::create` sans `leases.create` | agent sans `leases.create` | rouge, 201 |
| `BookingService::create` `$isStaff` → `$user->agency_id` | réservations (AC1d) | rouge, 201 et `customer_id` nul |
| `PayoutPolicy::update` sans le refus du bénéficiaire | hôte admin et bailleur | rouge, 200 |
| `StorePropertyRequest::authorize()` → `true` | compte sans profil | rouge, 201 |
| proposition sans `draft` imposé | bailleur | rouge |
| `destroy` → `update` | agent sur son propre bien | rouge, 204 |
| `UpdateStatusPropertyRequest` sans `publish` | rôle sans `properties.publish` | rouge, 200 |
| `assignAgent` → ancienne clause | B1 → B2 | rouge, 200 |
| `CustomerController::destroy` → `view` | auteur bailleur | rouge, 204 |
| `DocumentPolicy::delete` retiré | auteur du document | rouge, 403 |
| `->active()` de `roleAllows()` | co-admin suspendu | rouge, 200 |
| `->active()` de `isAgencyAdminAt()` | co-admin suspendu | rouge, 200 |
| filtre de l'auto-bascule | agent suspendu, `meta.active_profile_id` | rouge, `'agent:1'` |
| AC9 : cinq formes réintroduites dans `LeasePolicy::view` | `check-agency-scope-clause.mjs` | sortie 1 ×5 |

Une ablation reste **verte** : `UpdateVisibilityPropertyRequest` revenu à `update`. Le contrôleur
délègue à `publish()`, qui autorise `publish` : la requête est une seconde barrière (elle donne le
403 avant la validation), pas la seule.

### Étape 2 — §5 et §6 (back)

**Exports.** `ExportController::show` : table entité → capacité, contrôlée en tête, avant toute
requête ; un membre du personnel sans la capacité reçoit 403, le bailleur (non personnel) garde
ses biens et baux, le CRM lui reste refusé. Les deux `abort` en dur passent par
`errors.export_unknown_entity` / `errors.export_forbidden` (`lang/{fr,en,wo}/errors.php`, créé ici
avec les SEULES clés de ce ticket — TCK-588 crée le même fichier : à la fusion, réunir les deux
listes). Journal : `activity('export')`, événement `data_exported`, propriétés `entity`,
`filters` (`from`, `to`, `limit`), `row_count`, `agency_id`, `format`. `ExportDataService::scopeToActor`
lit le prédicat. `ExportScopingTest::test_an_agent_exports_his_agency…` passe sur un agent dont le
rôle porte les deux capacités : l'agent du rôle système n'exporte plus (conséquence ADR-0031).

**Blocage de compte** (`UserAdminController::block|activate`) : super-admin seul ; le helper
`ensureTargetInActorScope` n'avait plus d'appelant et est retiré. `UserAdminAgencyScopeTest` : les
quatre tests qui affirmaient le blocage par l'admin d'agence sont réécrits en refus (AC7).

**Suspension dans l'agence** : `POST /api/agencies/{agency}/team/{user}/suspend|reactivate`,
`SuspendTeamMemberRequest` (`team.suspend`, appelant PERSONNEL de l'agence de la route),
`TeamMemberSuspensionService`. Écart de re-mesure : **un jeton Sanctum ne porte aucun profil**
(`personal_access_tokens` n'a ni colonne ni nom qui le désigne ; le profil actif se résout à chaque
requête). « Les jetons dont le profil actif est dans l'agence » sont donc pris comme : tous les
jetons d'un membre qui n'a plus AUCUN profil actif ; s'il en garde un ailleurs, ses jetons servent
cette autre agence et la suspension prend effet ici sans eux (ADR-0031 §3 : dès la requête
suivante). Le profil agent passe par `AgentInvitationService::suspend` comme le Delta le demande —
qui exige aussi `isAgencyAdminAt` ou `team.invite` : un rôle personnalisé tenant `team.suspend`
sans `team.invite` serait refusé sur un agent (403), pas sur un bailleur ni un admin.

**Inventaire** `CapabilityEnforcementInventory::AWAITING` : les 16 lignes du tableau, re-mesurées
(TCK-592 n'est pas fusionné : `maintenance.*` y restent). `GET /api/capabilities` rend
`not_enforced` (AC10). Garde `scripts/check-capability-readers.mjs` (Repo CI) : 45 capacités,
29 lues, 16 inscrites, cliquet 16 ; dix cas d'auto-épreuve plus le cas « lue ET inscrite ».
`--ref=<commit>` classe un autre arbre : sur `e3ab4a4e` comme sur `32dd0b39`, **31 sans lecteur**,
dont `properties.create|delete|publish` et `leases.create` ; `invoices.create` et
`payouts.create` **lues** (par `createCapability()`, ability invoquée par `StoreInvoiceRequest` /
`StorePayoutRequest`) — AC8.

**Ablations, étape 2** :

| Retrait | Test | Résultat |
|---|---|---|
| capacité d'export (`canActAt(self::CAPABILITY…)` → `true`) | `ExportCapabilityTest` | rouge, 200 |
| journal `->log('data_exported')` | idem | rouge, aucune ligne |
| `team.suspend` de `SuspendTeamMemberRequest` | `TeamMemberSuspensionTest` | rouge, 200 |
| refus de `primary_admin_id` | idem | rouge, 200 |
| profils de l'agence seulement (sans `agency_id`) | bailleur de deux agences | rouge |
| lecture de `bookings.validate`, `bookings.cancel`, `invoices.send`, `invoices.write_off`, `payments.record` (bail), `crm.view_all`, `properties.update_own` — chacune seule | `BranchedCapabilitiesTest` | rouge ×7 |
| AC8 : cas ajouté à l'enum ; capacité inscrite branchée ; ligne retirée sans baisser le cliquet | `check-capability-readers.mjs` | sortie 1 ×3 |

### Étape 3 — §8 (back)

`POST /api/share/{token}` et `POST /api/share/{token}/download` (`share.show.post`,
`share.download.post`). Les `GET` correspondants n'ont **aucun** `throttle` sur `dev` (re-mesuré,
`routes/api/documents.php`) : les `POST` n'en ont donc pas non plus — TCK-602 posera le même sur
les quatre. Le mot de passe se lit par `post('password')` ; une query qui en porte un est refusée
en 400 `errors.share_password_in_query` avant `validate()`, sur `GET` comme sur `POST`, sans
incrément de `downloads_count`. `DocumentShareLinkTest` (l.141) et `DocumentShareLinkDownloadTest`
(l.181, 190) réécrits en `POST`.

**Écart d'AC15 :** « rouge à nouveau si `post('password')` redevient `input('password')` » ne
s'observe pas SEUL — le refus de la query, en tête, masque la différence (les deux ne diffèrent
que par la query). Mesuré : refus retiré + `input()` → `POST ?password=…` rend **200** ; refus
retiré + `post()` → **401** ; refus seul retiré → rouge (400 attendu, 401 vu). Les deux couches
sont donc chacune nécessaires, mais seule la seconde est observable isolément.

### Étape 4 — web (§2, §3, §5, §6, §8)

Chaque test de composant est éprouvé par ablation : rouge sur le code de `dev` (ou sans la
garde), vert avec, de nouveau vert après restauration.

| Garde | Test | Sans la garde |
|---|---|---|
| AC11 — actions d'un versement : `useCan('payouts.create')` ET pas bénéficiaire | `PayoutDetailDialog.capacites.test.tsx` (4) | rouge ×3 (bénéficiaire, bénéficiaire tenant la capacité, membre sans elle) |
| AC10 — mention « Sans effet pour l'instant » lue dans `not_enforced`, case cochable | `CapabilityMatrix.test.tsx` (+1) | rouge |
| AC14 — console d'équipe : « Suspendre de l'agence » / « Réactiver dans l'agence », jamais sur l'admin principal ni sur soi, aucun blocage de compte | `TeamConsole.suspension.test.tsx` (6) | table de `dev` → rouge ×4 ; tiroir de `dev` → rouge ; exclusion du principal retirée → rouge |
| AC14 — formulaire du bailleur : mention de relecture, « Proposer à mon agence », aucun contrôle de visibilité, corps `private` | `PropertyWizard.test.tsx` (+3) | rouge ×2 |
| §3 — barre latérale : « Proposer un bien à mon agence » pour le bailleur hors personnel | `AppSidebar.proposition.test.ts` (5) | rouge |
| §3 — menus d'un bien (liste et fiche) : publier / dépublier / disponible ⇐ `properties.publish`, supprimer ⇐ `properties.delete` | `PropertyActions.capacites.test.tsx` (4) | rouge ×2 |
| §5 (UX) — export offert selon `crm.export` / `payments.export` / `reports.export` | `ExportForm.capacites.test.tsx` (3) | rouge ×2 |
| AC15 — page de réception : 401 → champ ; `POST` dont l'URL ne porte pas le mot de passe ; téléchargement idem ; 401 / 404 / 410 nommés | `ShareReception.test.tsx` (6) | mot de passe en query → rouge |
| AC15 — `DocumentShareDialog` copie `${origin}/share/{token}` | `DocumentShareDialog.url.test.tsx` (1) | dialogue de `dev` → rouge |

**Choix faits à l'implémentation :**

- **Statut d'un membre dans l'agence.** La liste `/api/users` charge déjà
  `agentProfiles,ownerProfiles,agencyAdminProfiles` (mesuré : chaque profil y porte `agency_id` et
  `status`). La console en déduit le geste : un profil actif ici → « Suspendre » ; aucun actif et un
  `suspended`/`blocked` → « Réactiver » ; une invitation en attente → rien. L'admin principal vient
  de l'agence déjà lue par la page (`primary_admin_id`).
- **`postUserAction` retiré** : plus aucun appelant, et sa route refuse l'admin d'agence depuis
  l'étape 2. La console super-admin passe par `super-admin-users`, intacte.
- **Proposition du bailleur.** La barre latérale, l'état vide du tableau de bord bailleur et le titre
  de `/app/properties/new` jugent « hors personnel » sur les rôles (`owner` sans `agent` ni
  `agency_admin`) ; le serveur juge sur `properties.create`. Le rôle système du bailleur ne la porte
  pas, ceux du personnel si : les deux coïncident tant qu'aucun rôle personnalisé ne donne
  `properties.create` à un bailleur — auquel cas l'écran dit « proposer » et le serveur crée un
  bien de l'agence. Le parcours de création n'avait déjà **aucun** contrôle de visibilité (corps
  toujours `private`, `toCreatePayload`) ; le contrôle de publication vivait dans les menus de la
  liste et de la fiche, désormais gardés par capacité.
- **Page de réception** : `[locale]/(public)/share/[token]`, `noindex` et `no-referrer` (le jeton
  EST le droit d'accès). `DocumentShareDialog` distribue `/share/{token}` sans langue : le proxy
  pose celle du destinataire. Le 410 n'est pas détaillé (expiré / révoqué / épuisé) : l'API rend la
  même réponse sans code, l'écran nomme les trois causes ensemble.
- **i18n** : clés ajoutées sans reformatage (`admin.roles.matrix.not_enforced*`,
  `admin.team.suspension.*`, `shareReception.*`, `nav.sidebar.proposeProperty`,
  `dashboard.owner.proposal*`, `dashboard.pages.propertyNew.proposalTitle`,
  `property.wizard.proposal*`, `dashboard.exports.noneAllowed`). `namespaces.json` régénéré pour
  `shareReception` ; `--update` relevait aussi deux plafonds, remis à leur valeur — la garde passe
  avec eux.

**Vérifications :** `npx tsc --noEmit` propre, `npm run lint` 0 erreur, les 128 fichiers de test des
répertoires touchés verts (980 tests), toutes les gardes de `scripts/` et de `takussan-web/scripts/`
vertes.

### Étape 5 — fusion de `dev` (TCK-586) et re-vérification

**Fusion** `origin/dev` (merge 5f872f1f, TCK-586) → `48fcf5eb` ; `INDEX.md` régénéré, pas résolu à
la main ; `composer dump-autoload -o` (modèles du courtier supprimés). Correctif post-fusion
`18bb9b38` :

- `CollaboratorEligibleForProperty::eligible()` lit le prédicat du personnel
  (`MembershipCapabilityResolver::isStaffAt($user, $agencyId)`) — la règle de 586 jugeait encore
  par profil. Ablation : `isStaffAt` → `isOwnerAt` → `PropertyCollaboratorTest` rouge.
- Les 403 nommés restants passent par `lang/{fr,en,wo}/errors.php` : `account_block_reserved`
  (`UserAdminController::block|activate`), `staff_only` (`KpiConfigController`,
  `ThresholdAlertController`). Le fichier porte **cinq** clés, toutes de ce ticket.
- `OwnerIsolationWithinAgencyTest` : `PropertyFactory` tire `rent_period` au hasard, et un bien
  mensuel ou annuel est refusé à la réservation (422 `rent_period_not_bookable`). Les biens
  réservables de la fixture portent `RESERVABLE` (location à la nuitée) — trois exécutions
  consécutives, 76/76.

**Exécutions nommées** (`php artisan test <fichier>`, worktree, après `18bb9b38`) :

| AC | Fichier | Résultat |
|---|---|---|
| AC1, AC1b, AC1c, AC1d | `tests/Feature/Authorization/OwnerIsolationWithinAgencyTest.php` | 76 passés |
| AC2 | `tests/Feature/Api/PayoutTest.php` | 21 passés |
| AC3, AC4, AC5b | `tests/Feature/Api/PropertyAuthorizationTest.php` | 17 passés |
| AC5 | `tests/Feature/Api/DestroyAuthorizationTest.php` | 7 passés |
| AC6 | `tests/Feature/Api/ExportCapabilityTest.php` | 14 passés |
| AC7 | `tests/Feature/Api/UserAdminAgencyScopeTest.php` · `tests/Feature/Api/Agency/TeamMemberSuspensionTest.php` | 12 · 6 passés |
| AC12 | `tests/Feature/Authorization/BranchedCapabilitiesTest.php` | 30 passés |
| AC13 | `tests/Feature/Authorization/InactiveProfileGrantsNothingTest.php` | 2 passés |
| AC15 | `tests/Feature/Api/DocumentShareLinkPasswordTransportTest.php` | 7 passés |
| ADR-0031 | `tests/Feature/Authorization/StaffAgencyIdTest.php` · `tests/Feature/Api/PropertyCollaboratorTest.php` | 9 · 19 passés |
| AC8, AC9 | `node scripts/check-capability-readers.mjs` · `node scripts/check-agency-scope-clause.mjs` | sortie 0 (45 capacités : 29 lues, 16 inscrites) · sortie 0 (578 fichiers, 0 violation, 10 exemptions) |
| AC10, AC11, AC14, AC15 (web) | `npm run test` dans `takussan-web/` | 157 fichiers, 1 300 tests verts ; `npx tsc --noEmit` propre ; `npm run lint` 0 erreur |

Au-delà des AC : une liste de 296 fichiers de test candidats, dont 180 sous `tests/Feature/Api`,
jouée en quatre lots de config phpunit — 2 494 tests, verts (572 · 598 dont 2 ignorés · 719 · 605). Toutes les gardes racine et web vertes ;
`gen-index.mjs --check` vert. **La suite backend entière n'a pas été lancée : elle revient à la
session.**

**Ablations rejouées sur le code fusionné** (un remplacement, le test, restauration vérifiée par
comparaison d'octets ; tout rouge sans le correctif) :

| AC | Retrait | Test | Résultat |
|---|---|---|---|
| AC1 | `LeasePolicy::view` → `$user->agency_id === $model->agency_id` | `OwnerIsolationWithinAgencyTest` | rouge, 200 au lieu de 403 |
| AC1 | `LeaseController::index` → bloc d'avant (`if ($user->agency_id) …`) | idem (listes) | rouge, le bail de B1 dans la liste de B2 |
| AC1b | `LeasePaymentController::index` sans `authorize('view')` | idem (hors policy) | rouge, 200 |
| AC1b | `ConversationContextController` (baux) → bloc d'avant | idem, `test_le_contexte_de_conversation…` | rouge |
| AC1c | `LeaseService` sans `leases.create` | idem | rouge, 201 |
| AC1d | `BookingService` `$isStaff` → `$user->agency_id` | idem | rouge |
| AC2 | `PayoutPolicy::update` sans le refus du bénéficiaire | `PayoutTest` | rouge, 200 |
| AC3 | `StorePropertyRequest::authorize()` → `true` | `PropertyAuthorizationTest` | rouge, 201 |
| AC4 | `destroy` → `authorize('update')` | idem | rouge, 204 |
| AC5 | `CustomerController::destroy` → `authorize('view')` | `DestroyAuthorizationTest` | rouge, 204 |
| AC5 | `DocumentPolicy::delete` retiré | idem | rouge, l'auteur reçoit 403 |
| AC5b | `assignAgent` → `$target->agency_id === $agencyId` | `PropertyAuthorizationTest` | rouge, 200 au lieu de 422 |
| AC6 | `canActAt(capacité d'export)` → `true` | `ExportCapabilityTest` | rouge, 200 |
| AC6 | `->log('data_exported')` retiré | idem | rouge (`sole()` sans ligne, 4 erreurs) |
| AC7 | `SuspendTeamMemberRequest` sans `team.suspend` | `TeamMemberSuspensionTest` | rouge, 200 |
| AC7 | refus sur `primary_admin_id` retiré | idem | rouge, 200 au lieu de 422 |
| AC12 | `BookingPolicy::validate` sans `bookings.validate` | `BranchedCapabilitiesTest` | rouge, 200 |
| AC13 | `->active()` de `roleAllows()` · de `isAgencyAdminAt()` · filtre de l'auto-bascule, chacun seul | `InactiveProfileGrantsNothingTest` | rouge ×3 (200 · 200 · `'agent:1'`) |
| AC15 | refus de la query retiré, query lue | `DocumentShareLinkPasswordTransportTest` | rouge, 200 au lieu de 400 |
| AC8 | cas ajouté à l'enum · `payouts.approve` lue sans retirer sa ligne · ligne retirée, cliquet inchangé | `check-capability-readers.mjs` | sortie 1 ×3 (base : 0) |
| AC9 | cinq formes (`===`, ordre inversé, `==`, `!==`, `!=`) dans `LeasePolicy::view` | `check-agency-scope-clause.mjs` | sortie 1 ×5 (base : 0) |

Une première version de l'ablation `LeaseController::index` est restée **verte** : elle ne
remplaçait que l'`orWhere` et gardait `staffAgencyId() !== null` en condition, si bien que le
bailleur n'entrait jamais dans la clause. Ce n'était pas l'état d'avant. Rejouée sur le bloc
d'avant entier, elle rougit. Les ablations web de l'étape 4 n'ont pas été rejouées : la fusion de
586 ne touche aucun des fichiers du front qu'elles visent.

**Observation d'outillage** : une config phpunit posée HORS du dépôt (dans le répertoire temporaire
de la session) a vu ce répertoire vidé pendant l'exécution, puis recréé avec une copie de
`app/...` et un `.phpunit.result.cache`. Un test résout donc un chemin relatif à la config, et non
à `base_path()`. Il n'a pas été identifié. Le worktree, lui, n'a pas bougé.

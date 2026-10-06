---
id: TCK-587
title: "Un bailleur lit et modifie les baux, loyers, versements et biens des autres bailleurs de son agence ; supprimer n'est pas jugé par `delete` ; 31 capacités sur 45 ne sont lues par aucun geste"
status: todo
phase: P0
family: full
estimate: XL
wave: 73
created: 2026-10-06
updated: 2026-10-06
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#15-transactions--paiements
    - docs/features.md#16-crm--relation-client
    - docs/features.md#112-agence--équipe
    - docs/features.md#25-reporting--tableaux-de-bord
    - docs/features.md#26-audit--traçabilité
  models:
    - docs/models-spec.md#catalogue-capability-tck-278--tck-279
    - docs/models-spec.md#règle-5--profil--rôle
    - docs/models-spec.md#3-property
    - docs/models-spec.md#28-payout-
tags: [back, front, securite, autorisation, policies, capacites, bailleur, agence, export, equipe, adr-requise]
---

## Objectif utilisateur

- **Bailleur** : je ne vois et ne touche que mes biens, mes baux, mes loyers, mes réservations, mes
  versements et mes documents. Les autres bailleurs de mon agence ne voient rien des miens.
- **Agent** : je ne peux pas supprimer le bien d'un collègue ni un client de l'agence sans en avoir
  le droit, et ce qu'on m'a retiré dans mon rôle est réellement retiré.
- **Admin d'agence** : chaque case de l'éditeur de rôles fait ce qu'elle dit, ou elle dit qu'elle
  ne fait encore rien. Je suspends un membre de *mon* agence sans bannir son compte de toute la
  plateforme. Les exports du CRM et des paiements sont réservés à qui en a le droit, et tracés.

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
`InventoryController.php:51-55`, `PropertyController.php:38-41`. Et la clause est recopiée dans six
helpers exemptés par `scripts/check-controller-authorization.mjs` ou voisins :
`LeasePaymentController.php:61`, `BookingPaymentController.php:109`,
`DocumentShareLinkController.php:119`, `DocumentPdfController.php:93,113,129`,
`FavoriteController.php:36`, `ConversationContextController.php:102-104,145-147`. À la création :
`LeaseService.php:25-28` accepte `$user->agency_id && $property->agency_id === $user->agency_id`,
et `StoreLeaseRequest::authorize()` rend `true` (l.26).

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
  posé par le super-admin.** Ni l'un ni l'autre n'est journalisé. Le bouton vient de
  `TeamConsole.tsx:185-187`.

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

## Contrat de données

Aucune migration de schéma. Endpoints :

- **Modifiés (autorisation seulement)** : toutes les routes des ressources du §1 ; `POST
  /api/properties`, `DELETE /api/properties/{id}`, `POST .../publish|unpublish`, `PUT
  .../status|visibility` ; `DELETE /api/customers|guarantors|documents/{id}` ; `POST
  /api/payouts/{id}/mark-processed|mark-failed|cancel` ; `POST /api/invoices/{id}/send|mark-paid|cancel`
  ; `POST /api/bookings/{id}/confirm|reject|cancel` ; `GET /api/export/{entity}`.
- **Restreints au super-admin** : `POST /api/users/{user}/block|activate`.
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
   profil actif soit sur l'agence visée), plus — option recommandée — une `RoleDelegation` active de
   rôle `agent` ou `agency_admin` ; (b) qu'à l'intérieur de l'agence, **le bailleur est cloisonné à
   ses ressources** (précision du principe non négociable n° 2) ; (c) l'inventaire des capacités sans
   lecteur et son cliquet.
2. **Un seul prédicat.** `MembershipCapabilityResolver::staffAgencyId(User $user): ?int` rend
   l'agence du profil actif si le user y est personnel, sinon `null`. Toutes les clauses du §1 le
   lisent ; aucune ne réécrit l'expression. `MessagingReach::isActiveStaffAt()` (l.169-173) y est
   rebranché.
3. **Ce que garde le bailleur** : `landlord_id`, `property.user_id`, `created_by_id`, `issued_by_id`
   — ses propres ressources, rien d'autre. Les collaborateurs d'un bien restent hors périmètre
   (dette O9/B14 consignée par la session).
4. **Le bénéficiaire ne gère jamais son propre versement**, même s'il est aussi personnel
   (`PayoutPolicy::update` refuse `landlord_id === user.id` en tête).
5. **Piège `BasePolicy::delete()`** : avec `deleteCapability() === null`, elle n'accorde qu'au
   super-admin. Passer un `destroy` sur `authorize('delete')` impose de surcharger `delete()` dans
   la policy concernée, sinon le geste est fermé à tous.
6. **Ne pas réparer un test rouge en rouvrant la clause.** Les tests qui rougissent parce que leur
   « agent » est un `OwnerProfile` (§1, shim) se corrigent par `withAgentProfile($agency)` ou un
   profil admin explicite — jamais en rendant au bailleur un accès.
7. **Garde de sécurité prouvée par ablation** (règle 5 de la vague) : chaque test de refus rougit
   sur le code actuel et redevient rouge quand on retire le correctif.
8. **Aucun littéral de prose** (règle 1) : les `abort(403, 'CRM export restricted…')`
   (`ExportController.php:47,52`) et tout message réécrit passent par `__('errors.…')`.
9. **Coordination vague 73** :
   - **592** possède `MaintenanceRequestPolicy` (l.33, 51, 103) et `MaintenanceRequestController:43-44`
     — exclus ici ; 592 y applique le prédicat (ou `isAgentAt || isAgencyAdminAt` commenté `TCK-587`).
   - **590** possède `PropertyVisitController` (l.69, 234), **597** `ReviewController` (l.225, 245),
     **591** `CalendarController:45`, `TaskController:81` et `CustomerController` hors `destroy` :
     ces sites sont inscrits à l'exemption de la garde du §1 **au nom de leur ticket**.
     `CustomerController::index` (l.26-36) porte la fuite CRM : la session arbitre entre « 587 ne
     modifie que ce bloc `where` » et « 591 l'applique ».
   - **594** ajoute `PayoutPolicy::approve` et `payouts.approve` ; 587 ne touche que `view`/`update`
     et les actions existantes de `PayoutDetailDialog`.
   - **595** ajoute des types d'export : chacun déclare sa capacité dans la table d'export de 587.
     595 touche `PropertyController::index` (eager-loading) : 587 n'y touche que la clause `where`.
   - **596** possède `InventoryController` (show, suppression) : 587 n'y touche que le `where`
     d'`index` (l.42-56). **601** affiche l'entrée de journal d'export ; 587 l'écrit. **600** possède
     `UserAdminController::destroy` et `/api/admin/users/*`.
   - Tout ticket qui branche une capacité **retire sa ligne de l'inventaire dans le même commit**.

## Delta à produire

### 0. Décision
- [ ] ADR (prochain numéro libre) « Le personnel de l'agence et le cloisonnement des bailleurs ;
      capacités sans lecteur » — accepté avant le code (contrainte 1).

### 1. Cloisonnement
- [ ] `MembershipCapabilityResolver::staffAgencyId()` + `User::staffAgencyId()` (proxy) ; tests
      unitaires : agent actif, agent suspendu, admin, bailleur seul, bailleur + agent même agence,
      multi-agences sans profil actif, délégation active / échue.
- [ ] Policies : `Lease` (7 clauses), `LeasePayment`, `Payout` (`view`/`update`), `Invoice`,
      `Booking`, `Document` (6 branches dont `Agency`), `Inventory`, `PropertyVisit`, `Property`,
      `Customer`, `Guarantor` → prédicat.
- [ ] `index` : `LeaseController`, `PayoutController`, `InvoiceController`, `BookingController`,
      `InventoryController` (bloc `where` seul), `PropertyController` (bailleur : `user_id` seul).
- [ ] Helpers : `LeasePaymentController::authorizeLeaseAccess`,
      `BookingPaymentController::authorizeBookingAccess`, `DocumentShareLinkController::authorizeDocument`,
      `DocumentPdfController::authorize{Receipt,Invoice,Lease}` → délégation à la policy du modèle
      quand la règle est identique (et retrait de leur entrée `EXEMPTIONS_JUSTIFIEES`), sinon
      prédicat. `FavoriteController:36`, `ConversationContextController:102-104,145-147` → prédicat.
- [ ] `LeaseService::create` : `property.user_id === user` OU (personnel de l'agence du bien ET
      `leases.create`).
- [ ] Garde `scripts/check-agency-scope-clause.mjs` : interdit, sous `app/Policies`,
      `app/Http/Controllers`, `app/Services`, toute comparaison de `$user->agency_id` à un
      `->agency_id` et tout `where|orWhere('…agency_id', $user->agency_id)`, sauf instruction qui
      appelle aussi `isAgencyAdminAt(` ou le prédicat ; exemptions `fichier::méthode → TCK-NNN`
      refusées si mortes ; cliquet **bilatéral** sur leur nombre ; s'auto-éprouve à chaque
      invocation sur ≥ 5 formes d'écriture (espacée, `!==`, `&&` en tête, `orWhereHas` imbriqué,
      `$actor->`).
- [ ] Tests : `tests/Feature/Authorization/OwnerIsolationWithinAgencyTest.php` — une agence, deux
      bailleurs B1/B2 (chacun bien, bail, loyer, réservation, versement, facture, document, état des
      lieux, visite, client ajouté), un agent. Fournisseur de données par endpoint : B2 → 403 sur
      `show`/`update` de chaque ressource de B1 et absent de chaque `index` ; agent → 200.

### 2. Versements et factures
- [ ] `PayoutPolicy::view` : bénéficiaire, émetteur, ou personnel tenant `payouts.create`.
      `update` : refus si bénéficiaire ; sinon émetteur personnel ou personnel tenant `payouts.create`.
- [ ] `InvoicePolicy` : abilities `send` (`invoices.send`), `markPaid` (`payments.record`), `cancel`
      (`invoices.write_off`), toutes réservées au personnel ; `InvoiceController` les invoque.
- [ ] `PayoutTest::test_landlord_of_same_agency_cannot_manage_own_payout` (bailleur AVEC profil
      dans l'agence, sur les trois transitions) ; l'ancien test sans agence reste.
- [ ] Web : actions du détail d'un versement conditionnées à la capacité (via `useCan`) et au fait
      de ne pas être le bénéficiaire.

### 3. Biens
- [ ] `PropertyPolicy::create` : `properties.create` dans l'agence du profil actif, OU bailleur
      actif de cette agence (**proposition** : le contrôleur impose `draft` + `private`).
      `update` : auteur personnel ou bailleur → `properties.update_own` ; autre bien de l'agence →
      `properties.update_any`. `delete` : `properties.delete` dans l'agence du bien. Nouvelle ability
      `publish` : `properties.publish`.
- [ ] `PropertyController` : `authorize('create', Property::class)` en tête de `store` ;
      `destroy` → `delete` ; `publish`/`unpublish` → `publish`. `UpdateVisibilityPropertyRequest`
      (→ `public`) et `UpdateStatusPropertyRequest` (→ `available`/`published`) exigent aussi `publish`.
- [ ] Proposition du bailleur : notification au personnel (agent assigné aux biens du bailleur,
      sinon admins), par clé `__('notifications.property_proposed…')`.
- [ ] Web : « Mes biens » du bailleur = ses biens ; « Proposer un bien à mon agence » remplace
      « Ajouter un bien » pour le bailleur non-personnel (menu, état vide, formulaire sans publication).
- [ ] Tests `tests/Feature/Api/PropertyAuthorizationTest.php`.

### 4. Suppressions
- [ ] `CustomerPolicy::delete` : auteur personnel, ou personnel tenant `crm.view_all` ;
      `CustomerPolicy::view` : auteur, ou personnel avec `crm.view_all` (sinon ses seuls clients).
      `GuarantorPolicy::delete` : auteur, ou personnel de l'agence de l'auteur.
      `DocumentPolicy::delete` = règle actuelle d'`update` (comportement constant).
- [ ] `destroy` de `Customer`, `Guarantor`, `Document` → `authorize('delete', …)`.
- [ ] `BookingPolicy` : abilities `validate` (`bookings.validate` pour le personnel ; propriétaire du
      bien) et `cancel` (client de la réservation, propriétaire du bien, ou personnel avec
      `bookings.cancel`) ; `confirm`/`reject` → `validate`, `CancelBookingRequest` → `cancel`.
- [ ] Tests `tests/Feature/Api/DestroyAuthorizationTest.php` (HTTP, pas d'appel direct de policy).

### 5. Exports et suspension
- [ ] `ExportController::show` : table entité → capacité (`customers` → `crm.export`, `payments` →
      `payments.export`, `leases`/`properties` → `reports.export` pour le personnel ; le bailleur
      garde l'export de **ses** biens et baux) ; contrôle en tête, avant toute requête.
      `ExportDataService::scopeToActor` lit le prédicat.
- [ ] Journal : `activity('export')` événement `data_exported`, propriétés `entity`, `filters`,
      `row_count`, `agency_id`.
- [ ] `UserAdminController::block|activate` : super-admin seul.
- [ ] `Agency\TeamMemberSuspensionController` + `SuspendTeamMemberRequest` (`team.suspend` dans
      l'agence de la route = agence du profil actif) + `App\Services\Membership\TeamMemberSuspensionService` :
      suspend **tous** les profils de la cible dans l'agence (agent → `suspended` via
      `AgentInvitationService::suspend`, admin → `suspended`, bailleur → `blocked`), refuse
      `primary_admin_id` et soi-même (422), révoque les jetons dont le profil actif est dans
      l'agence, journalise ; `reactivate` symétrique.
- [ ] Web : « Suspendre de l'agence » / « Réactiver » dans la console d'équipe ; la console
      super-admin garde le blocage de compte.
- [ ] Tests `tests/Feature/Api/ExportCapabilityTest.php`,
      `tests/Feature/Api/Agency/TeamMemberSuspensionTest.php`.

### 6. Capacités sans lecteur
- [ ] `App\Services\Membership\CapabilityEnforcementInventory` : `const AWAITING` — une ligne par
      capacité sans lecteur, valeur = ticket qui la branche. État visé à la fusion de 587 (16 lignes) :

      | Capacité | Ticket | | Capacité | Ticket |
      |---|---|---|---|---|
      | `maintenance.assign`, `maintenance.close` | TCK-592 | | `payouts.approve`, `agency.update_billing` | TCK-594 |
      | `payments.refund`, `bookings.refund` | TCK-594 (à arbitrer avec 596) | | `leases.sign` | TCK-596 |
      | `team.remove`, `crm.assign` | TCK-591 | | `agency.update_kyc` | TCK-601 |
      | `reports.view_global`, `properties.moderate`, `agency.upgrade_request` | TCK-600 (à arbitrer) | | `agency.update`, `messaging.broadcast`, `messaging.archive` | dette à ouvrir (aucun geste) |

      Les 15 autres sans lecteur aujourd'hui sont branchées par ce ticket (§2-§5).
- [ ] Garde `scripts/check-capability-readers.mjs` (rejouée par `repo-ci.yml`) : chaque cas de
      l'enum est **soit** lu (définition du §6 du Contexte, `*Capability()` compté seulement si
      l'ability est invoquée pour ce modèle), **soit** dans l'inventaire — jamais les deux, jamais
      aucun. Cliquet bilatéral sur la taille. S'auto-éprouve à chaque invocation sur des extraits
      figés (≥ 5 formes, dont nom de route, docblock, déclaration `deleteCapability()` non atteinte).
- [ ] `CapabilityController::index` : `not_enforced` lu depuis l'inventaire.
- [ ] Web : mention « sans effet pour l'instant » dans l'éditeur de rôles.

## Critères d'acceptation

- [ ] **AC1** — `OwnerIsolationWithinAgencyTest` : pour chacune des 11 ressources du §1, un bailleur
      **ayant un profil dans la même agence** reçoit 403 sur la ressource d'un autre bailleur et ne la
      trouve dans aucune liste ; l'agent de l'agence reçoit 200. Le test rougit sur `e3ab4a4e`, et
      redevient rouge si l'on rétablit la clause `agency_id === agency_id` dans **une seule** policy.
- [ ] **AC2** — Un bailleur bénéficiaire, profil actif dans l'agence émettrice, reçoit 403 sur
      `mark-processed`, `mark-failed` et `cancel` de **son** versement ; un agent sans
      `payouts.create` (rôle personnalisé) reçoit 403 ; un agent du rôle système, 200.
- [ ] **AC3** — `POST /api/properties` : client sans profil → 403 ; bailleur invité → 201 avec
      `status = draft` et `visibility = private` même si le corps demande `available`/`public` ;
      agent → 201. Rougit sur le code actuel (client → 201 aujourd'hui).
- [ ] **AC4** — Un agent du rôle système reçoit 403 sur `DELETE /api/properties/{id}` d'un bien d'un
      collègue (il ne tient pas `properties.delete`) et 403 sur `PATCH` de ce bien (pas
      `update_any`) ; l'admin d'agence reçoit 204 / 200. Un rôle sans `properties.publish` reçoit 403
      sur `publish`, **et** sur `PUT .../visibility` vers `public`, **et** sur `PUT .../status` vers
      `available`.
- [ ] **AC5** — Un bailleur de l'agence reçoit 403 sur `DELETE /api/customers/{id}` et
      `/api/guarantors/{id}` d'un client de l'agence qu'il n'a pas ajouté ; l'auteur du document le
      supprime toujours (204), un autre membre de l'agence non (403).
- [ ] **AC6** — `GET /api/export/customers` : agent du rôle système → 403 ; admin → 200 **et** une
      ligne `activity_log` `data_exported` avec `row_count` égal au nombre de lignes rendues. Même
      chose pour `payments` avec `payments.export`. Le bailleur exporte ses biens : uniquement les
      siens (valeur attendue, pas une longueur).
- [ ] **AC7** — Un admin d'agence reçoit 403 sur `POST /api/users/{id}/block` **et** sur
      `/activate` d'un compte bloqué par le super-admin. `POST /api/agencies/{a}/team/{u}/suspend`
      sur un bailleur présent dans deux agences : son profil de l'agence A passe `blocked`, son
      `users.status` reste `active`, il se connecte et agit dans l'agence B. Sur `primary_admin_id` →
      422. Une ligne d'activité est écrite.
- [ ] **AC8** — `check-capability-readers.mjs` sort en 0 sur la branche, et en 1 : si l'on ajoute un
      cas à l'enum sans lecteur ni ligne d'inventaire ; si l'on branche une capacité inventoriée sans
      retirer sa ligne ; si l'on retire une ligne sans baisser le cliquet. Lancée sur `e3ab4a4e`,
      elle classe `properties.delete`, `properties.create`, `leases.create` et `properties.publish`
      **sans lecteur** et `invoices.create`, `payouts.create` **lus**.
- [ ] **AC9** — `check-agency-scope-clause.mjs` sort en 1 si l'on réintroduit
      `$user->agency_id === $model->agency_id` dans `LeasePolicy::view`, sous chacune des cinq formes
      de son auto-épreuve.
- [ ] **AC10** — `GET /api/capabilities` rend `not_enforced` contenant exactement les lignes de
      l'inventaire, et l'éditeur de rôles affiche la mention sur `payouts.approve` (test de composant).
- [ ] **AC11** — Le bailleur ne voit pas les actions d'un versement ; l'admin d'agence les voit
      (test de composant sur les deux cas).

## Hors périmètre

- `MaintenanceRequestPolicy` et le contrôleur de maintenance (TCK-592).
- Lecture des biens par les collaborateurs, rôles `co_owner` / `viewer` (dette O9/B14).
- Approbation à quatre yeux et `payouts.approve` (TCK-594) ; remboursements.
- Le chiffrement du RIB et des pièces du bailleur (TCK-601), la journalisation du `catch` de
  `PropertyController::store` (TCK-601).
- Suppression de capacités du catalogue : l'inventaire les signale, il ne les retire pas.
- Un statut dédié « proposé à l'agence » : la proposition est un brouillon privé.

## Notes d'implémentation

_(à remplir par implementing-specs)_

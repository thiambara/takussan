---
id: TCK-591
title: "Le CRM de l'agent ne tient pas au téléphone : numéro libre, pipeline sans geste mobile, tâches sans page, fiche éclatée, agenda partiel et ouvert au bailleur, actions en masse muettes, portefeuille orphelin au départ d'un agent"
status: doing
phase: P1
family: full
estimate: XL
wave: 73
created: 2026-10-06
updated: 2026-10-07
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#16-crm--relation-client
    - docs/features.md#13-réservations-courte-durée--visites
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#112-agence--équipe
    - docs/features.md#18-maintenance--interventions
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#7-customer
    - docs/models-spec.md#9-usercustomerrelationship
    - docs/models-spec.md#32-task-
    - docs/models-spec.md#8-propertycollaborator
    - docs/models-spec.md#21-maintenancerequest-
    - docs/models-spec.md#66-roledelegation-
tags: [back, front, crm, pipeline, tâches, calendrier, ics, bulk, équipe, passation, sécurité, adr-requise]
---

## Objectif utilisateur

- **Agent** : depuis son téléphone, il joint un client en un geste sur un numéro fiable, fait avancer
  son pipeline sans glisser-déposer, retrouve ses tâches et son agenda complet (et l'abonne à son
  téléphone), voit sur une seule fiche tout ce qui concerne un client, et sait quels prospects
  correspondent à un bien.
- **Admin d'agence** : il agit en lot sur les biens avec un bilan exact, et quand un agent part ou
  s'absente, rien de son portefeuille ne reste attribué à un absent.
- **Prestataire** : le raccourci « Calendrier » qu'on lui propose mène à ses interventions
  planifiées, au lieu de le renvoyer à l'accueil.
- **Bailleur** : il ne voit plus le CRM, l'agenda ni les tâches de l'agence — seulement ce qui
  concerne ses biens et les fiches qu'il a lui-même ajoutées ; quand l'agence désigne ou change
  l'agent responsable de son bien, le bien reste le sien — tableau de bord, droits, et bailleur des
  baux à venir.

## Contexte

Analyse par acteur du 2026-10-06, vague 73 (points A9-A13, A16, A17 du rapport agent ; AD14 du
rapport admin d'agence ; partie calendrier de P17 du rapport prestataire). **Chaque constat a été
re-mesuré** sur l'arbre `e3ab4a4e` ; trois sont corrigés par rapport aux rapports, deux sont neufs.
La passe de correction du 2026-10-06 a ajouté les défauts marqués **« Passe de correction »** :
chaque défaut relevé ici a désormais sa case au Delta et un AC qui rougit sur le code actuel.

**1. Un numéro de client non fiable, aucun geste pour le joindre (A9).**
`phone` est `['nullable','string']` à la création et à la mise à jour
(`StoreCustomerRequest.php:37`, `UpdateCustomerRequest.php:44`) ; la règle `TelephoneJoignable`
(TCK-574) ne sert qu'aux comptes utilisateurs. Aucune normalisation, aucun index ni dédoublonnage
(`create_customers_table.php:19`, index l.32-34). La saisie est un champ texte libre
(`CustomerForm.tsx:150-157`), pas la saisie de téléphone du profil. La console n'a aucun lien
WhatsApp (`wa.me` seulement en public : `WhatsAppButton.tsx:26`), et deux `tel:` en tout
(`CustomerList.tsx:77`, `VisitDetail.tsx:431`).

**2. Pipeline inutilisable sans souris (A10).** Seul `PointerSensor` est déclaré
(`PipelineKanban.tsx:52-54`) et le `DndContext` n'enveloppe que la vue `md+` (l.202-230). La vue
mobile (l.162-200) montre une colonne sans aucun geste de déplacement ; le tiroir affiche l'étape en
lecture seule (`CustomerDetailSheet.tsx:178`). Chaque colonne s'arrête à 50 cartes
(`lib/queries/pipeline.ts:50`), la pagination est jetée (l.69-73), et le compteur d'onglet compte
les cartes chargées (`PipelineKanban.tsx:184`) alors que `pipeline-stats` rend déjà `stage_counts`
(`PipelineStatsService.php:47`).

**3. Pas de page « Mes tâches » ; le lien du tableau de bord boucle (A11).** « Tâches du jour »
pointe sur la page elle-même (`overview/agent/page.tsx:88-92`). Il n'existe aucune route
`/app/tasks`. Les tâches ne se créent que dans le tiroir du pipeline, alors que l'API accepte une
tâche sur un bien (`StoreTaskRequest.php:38-41`). `Task` n'a aucun filtre d'échéance
(`Task.php:31`), et la réponse ne dit pas à quoi la tâche se rattache (`TaskController::format`,
l.121-139 : `taskable_type` en nom de classe, pas de libellé).
**Passe de correction — quatre gardes fausses sur les tâches :**
- `authorizeAssignee` accepte un **bailleur** de l'agence comme assigné (`TaskController.php:83-87`,
  `isOwnerAt`), avec un message en anglais en dur (l.89).
- `update` ne rejoue **aucun** contrôle d'assigné : `UpdateTaskRequest.php:41` valide
  `assigned_to_id` par `exists:users,id` seul, et `TaskController::update` (l.99-111) l'écrit tel
  quel — un `PUT` pousse la tâche chez **n'importe quel utilisateur de la plateforme**, ce que
  `store` interdit.
- `destroy` est autorisé par `view` (l.115) : l'**assigné** supprime la tâche que son admin lui a
  confiée, sans trace.
- `TaskPolicy::attachTo` (l.49-60) juge l'agence par `$user->agency_id` : un bailleur rattache une
  tâche à **n'importe quel** client ou bien de l'agence. Aujourd'hui sans effet visible ; avec le
  `taskable.label` que ce ticket ajoute, ce serait une **énumération des noms de clients** de l'agence.

**4. Deux fiches client, et l'onglet Activité toujours vide pour l'agent (A12).** La fiche pleine
page a quatre onglets (`CustomerDetailTabs.tsx:50-53`), le tiroir quatre autres
(`CustomerDetailSheet.tsx:163-166`) ; aucune ne montre visites, réservations ou baux, pourtant
filtrables (`PropertyVisit.php:34`, `Booking.php:44`, `Lease.php:75` par `tenant_id`).
**Neuf :** l'onglet Activité appelle `/api/audit-log` (`CustomerDetailSheet.tsx:45-61`), que
`IndexAuditLogRequest::authorize` (l.29-35) réserve au super-admin et à l'admin d'agence. Pour un
agent : 403, avalé en `[]` (l.58-60) — l'onglet est **vide en silence** pour son premier usager.
**Passe de correction :** même ouvert, le journal ne contiendrait que les changements du client :
`Customer` est `Auditable` (`Customer.php:23`), **ni `CustomerNote` ni `Task`** ne le sont
(`CustomerNote.php:12`, `Task.php:15`). Et la note épinglée d'un passage en « converti » / « perdu »
est **écrite en français dans la base** (`CustomerController.php:100-101` et `:192-193`,
`'Conversion : '` / `'Perte : '`) : un agent anglophone ou wolophone la lit en français, et la
seconde n'est même pas passée par `__()`.

**5. Ni critères de recherche, ni rapprochement (A13).** `customers` ne porte ni budget, ni type,
ni zone (`create_customers_table.php:12-29`). Aucun service ne rapproche biens et prospects.
`PropertySearchService` interroge Meilisearch, qui n'indexe que les biens publics (TCK-578) : il ne
peut pas servir un rapprochement qui doit voir le portefeuille privé de l'agence.

**6. Un calendrier partiel, et ouvert au bailleur (A16, P17).** `types.*` est borné à
`in:booking,visit` (`IndexCalendarRequest.php:39-40`) : ni tâches, ni fins ou renouvellements de
bail (`create_leases_table.php:24-25`), ni interventions (`maintenance_requests.scheduled_at`).
Aucun filtre « mes rendez-vous », aucun export iCalendar (grep `text/calendar` : vide).
**Neuf, sécurité :** le périmètre non-admin repose sur `$user->agency_id`
(`CalendarController.php:45`, `:55-66`), c'est-à-dire l'agence du profil actif **quel qu'il soit**
(`User.php:228-251`) : un **bailleur** de l'agence voit les réservations et visites de **tous** les
biens de l'agence. **Passe de correction :** la branche visites ajoute `agent_id = moi` **sans
condition d'agence** (`CalendarController.php:128`) : un agent **retiré** de l'agence continue de
voir, dans son agenda, les visites qui lui restent assignées (titre du bien, horaire, statut). Le
message de refus l.51 est un littéral anglais. La branche collaborateur (`:63`) exige
`accepted_at`, que rien n'écrit (relevé de TCK-504) : elle n'ouvre rien, et l'ouverture des
lectures aux collaborateurs est **différée par décision du porteur** (dette D-66) — ce ticket ne
l'élargit ni ne la retire. **Corrigé (P17) :** le prestataire ne voit pas un calendrier vide — le
raccourci le lui pousse (`DashboardShortcuts.tsx:76-79`) mais la page le **redirige**
(`calendar/layout.tsx:39` → `lib/auth/guards.ts:35-38`) : un geste proposé qui ne mène nulle part.

**7. Actions en masse non atomiques et muettes (A17).** Archiver, dépublier et réattribuer lancent
un `Promise.all` d'appels unitaires (`PropertyList.tsx:114-133`, `:313-329`) ; au premier échec,
seul son message s'affiche et la sélection reste entière, succès compris (l.124-127). L'endpoint
`POST properties/bulk-archive` existe (TCK-074 : `routes/api/properties.php:20`,
`PropertyController::bulkArchive` l.297-314, motifs d'échec en codes), mais seul le super-admin
l'appelle (`lib/queries/super-admin.ts:505`). « Réattribuer » écrit `properties.user_id`
(`PropertyController::assignAgent` l.254) après un contrôle d'appartenance qui laisse passer un
**bailleur** de l'agence (l.247-251, même accesseur) — le geste **unitaire** (`PUT
properties/{p}/assigned-agent`) porte ce défaut, pas seulement le lot.
**Passe de correction — la réattribution dépossède le bailleur.** `properties.user_id` **est** le
propriétaire (`Property::owner()`, `Property.php:712-715`) : un bien proposé par un bailleur porte
son `user_id` (`PropertyController::store` l.78), et c'est sur cette colonne que reposent ses droits
(`PropertyPolicy.php:48`, `:102`) et son agenda (`CalendarController.php:58`). « Réattribuer » ce bien
à un agent **remplace le bailleur** par l'agent : il perd l'accès à son propre bien, sans
avertissement.
**Consolidation (2026-10-06) — la colonne réécrite est celle du propriétaire, dans tous les cas.**
`docs/models-spec.md:380` : `user_id` = « Propriétaire du bien ». Le bailleur perd le bien de son
tableau de bord (`DashboardOwnerService.php:25`, `where('user_id', $owner->id)`), et **tout bail
créé ensuite désigne l'agent comme bailleur** : `LeaseService::create` tire `landlord_id` de
`$property->user_id` (`Services/Model/LeaseService.php:32`) et en déduit aussi le droit de créer le
bail (l.26). Refuser le cas « bien tenu par un bailleur » (`owner_held`, ce que prescrivait la passe
précédente) ne suffit pas : le geste continuerait de réécrire `user_id` sur tout bien saisi par un
agent, et le mot « réattribuer » continuerait de désigner un changement de propriétaire.
**Où vit aujourd'hui l'agent responsable** (re-mesuré) : dans **aucune colonne de `properties`**
(`create_properties_table.php:13`, seul `user_id`). C'est `App\Services\Property\PrimaryPropertyContact`
(TCK-502) — le collaborateur de rôle `agent` le plus anciennement invité (`invited_at`, puis `id`),
à défaut le propriétaire (`PrimaryPropertyContact.php:57-60`, `:77-108`) ; il sert la carte de
contact, le téléphone public, le message et le lead (`PropertyResource.php:306`,
`PublicPropertyController.php:966`, `PropertyConversationResolver.php:51`). Le choix **explicite**
de cet agent principal (marque sur `property_collaborators`) est l'objet de **TCK-504** (`todo`,
P2, Delta l.70-73). `assignAgent` n'écrit rien de tout cela : le « responsable » qu'il prétend
changer n'est pas celui que la plateforme affiche ni celui qui reçoit les messages.
**Trace des réattributions passées** : `user_id` est `fillable` (`Property.php:43`) et `Property`
est `Auditable` (`Property.php:37`, `logFillable` + `logOnlyDirty`, `Bases/Auditable.php:17-24`) —
chaque réattribution a laissé une entrée `activity_log` (`log_name = Property`, `event = updated`,
`properties.old.user_id` ≠ `properties.attributes.user_id`). `assignAgent` est le **seul** chemin
de mise à jour qui écrit cette colonne (grep `'user_id'` dans `app/Http/Requests/Api/*Property*` :
`AssignAgentPropertyRequest.php:36` seul ; `store` et la duplication la posent à la création). Les
biens touchés se retrouvent donc sans ambiguïté. **Aucune production API n'existe**
(`docs/infra/hebergement.md:23` : `api.takussan.com`, « aucun service jusqu'à la phase F ») ; la
seule base qui peut en contenir est la préproduction `takussan_preview` (`hebergement.md:80`).

**8. Un agent qui part laisse son portefeuille à un absent (AD14).** **Corrigé :** l'écran Équipe
(`TeamConsole.tsx:196` → `lib/queries/agency-members.ts:113-125`) appelle
`AgencyController::removeAgent` (l.225-266), qui supprime les profils **sans aucune journalisation**
; `AgentInvitationService::remove` (l.163-185, journalisé) n'est atteint que par
`DELETE /api/profiles/{agent_profile}`, qu'aucun écran n'appelle. Aucun des deux ne touche aux
tâches (`tasks.assigned_to_id`), visites (`property_visits.agent_id`), interventions
(`maintenance_requests.assigned_to`), collaborations (`property_collaborators.user_id`), biens dont
l'agent est l'agent principal (collaborateur `agent`, cf. 7) ou qu'il a saisis (`properties.user_id`
= lui, `PropertyController::store` l.78 — il en reste le « propriétaire » et garde, par
`PropertyPolicy.php:48` et `:102`, la lecture et la modification du bien après son départ), ni aux
clients dont il est référent.
**Corrigé :** le référent client **existe** (`user_customer_relationships` `agent_client` +
`is_primary`, `CustomerController::setPrimaryContact` l.121-142, spec §1.6 P1), mais aucun écran ne
le pose, et l'endpoint accepte **n'importe quel utilisateur de la plateforme**
(`SetPrimaryContactCustomerRequest.php:36`, `exists:users,id`). `Capability::CrmAssign` n'a aucun
lecteur. Côté absence, `RoleDelegation` ne sait pas dire **qui** est absent (`delegator_id` = l'admin
auteur) et n'accorde que des capacités que le remplaçant détient déjà.
**Passe de correction — « Retirer de l'agence » échoue hors des agents.** Le geste est proposé sur
**chaque** ligne de la console d'équipe (`AdminUsersTable.tsx:276-286`), onglets admins et
propriétaires compris (`TeamConsole.tsx:38-43`), mais `removeAgent` exige un `AgentProfile`
(`AgencyController.php:227-228`) : un admin d'agence sans profil agent, ou un bailleur, rend **422**
`user_not_in_agency` — le geste ne fait pas ce qu'il dit. Et `team.remove` n'y est pas lue : le
retrait s'autorise par `can('update', $agency)` (l.274-277).

**9. Le CRM de l'agence est ouvert au bailleur (passe de correction).** `CustomerController::index`
(l.26-37) et `PipelineStatsService::scopedQuery` (l.61-79) rendent **tous** les clients de
`$user->agency_id` — l'agence du profil actif, bailleur compris (`User.php:228-251`) — et la console
le lui sert (`customers/layout.tsx:40`, `crm/pipeline/layout.tsx:39` → `assertCanReachAgentArea`,
qui admet `owner`). Un bailleur lit donc noms, téléphones, étapes et budgets des prospects de
l'agence. Le CRM est 🧑‍💼 dans la spec (`features.md` §1.6). `StoreCustomerRequest::authorize`
rend `true` (l.25-28) : n'importe quel compte crée une fiche dans le CRM de l'agence de son profil
actif (`CustomerController::store` l.58). TCK-587 réécrit `CustomerPolicy::view` (auteur, ou
personnel avec `crm.view_all`) mais laisse à ce ticket la clause `where` d'`index`
(TCK-587, Contraintes 9).

## Contrat de données

**Customer** (`docs/models-spec.md#7-customer`) — migration
`YYYY_MM_DD_HHMMSS_add_search_criteria_to_customers_table` :
`seeking_contract_type` (string 20, valeurs de `ContractType`, contrôle applicatif — pas d'`enum()`,
ADR-0007), `budget_min` / `budget_max` (decimal 15,2), `seeking_property_types`,
`seeking_cities`, `seeking_neighborhoods` (**jsonb**, listes), `min_bedrooms` (unsignedSmallInteger),
tous nullables ; index `customers_agency_phone_idx (agency_id, phone)` et index d'expression
`customers_agency_email_ci_idx` sur `(agency_id, LOWER(email COLLATE "und-x-icu"))` — la requête
de doublon écrit **exactement** cette expression (`CaseInsensitive::sql()` / `fold()`, ADR-0025).
Vocabulaire aligné sur les paramètres de `PropertySearchService` (TCK-599 pourra convertir un
prospect en recherche sauvegardée sans traduction).

**CustomerNote** — migration `YYYY_MM_DD_HHMMSS_add_kind_to_customer_notes_table` : `kind`
(string 20, nullable ; `conversion | loss`, contrôle applicatif ; `null` = note libre). Le corps
ne porte plus que le motif saisi ; le préfixe se rend côté front dans la langue du lecteur. Le
`up()` reprend les lignes existantes dont le corps commence par `Conversion : ` / `Perte : `
(préfixe retiré, `kind` posé) ; le `down()` les réécrit à l'identique.

**Agent responsable d'un bien** (consolidation) — aucune colonne neuve sous l'option retenue par
défaut de l'ADR (marque de collaborateur principal de TCK-504, `docs/models-spec.md#8-propertycollaborator`) ;
sous l'option B, migration `add_responsible_agent_id_to_properties_table` (FK nommée
`properties_responsible_agent_fk`, `nullOnDelete`, index nommé, `down()` exact). `properties.user_id`
garde son sens de spec : le propriétaire.

**Endpoints** (tous sous `auth:sanctum`, enveloppe JSON standard, sparse fieldsets) :

| Méthode | Route | Contrôleur | Rôle |
|---|---|---|---|
| GET | `customers`, `customers/pipeline-stats` | `CustomerController::index/pipelineStats` | périmètre = celui de `CustomerPolicy::view` (TCK-587), par `Customer::scopeVisibleTo` : personnel titulaire de `crm.view_all` → l'agence ; tout autre compte (personnel sans la capacité, bailleur, client) → ses seuls ajouts |
| POST/PUT | `customers`, `customers/{c}` | `CustomerController::store/update` | `store` réservé au personnel (`CustomerPolicy::create`, 403 sinon) ; téléphone normalisé ; doublon → **409** `customer_duplicate` + `existing[]` (id, nom, `matched_on`), sauf `allow_duplicate=true` |
| GET | `customers/{c}/activity` | `CustomerController::activity` | journal du client, de ses notes et de ses tâches ; autorisé par `view` du client |
| POST | `customers/{c}/primary-contact` | `CustomerController::setPrimaryContact` | référent = personnel de l'agence du client, capacité `crm.assign` |
| GET | `customers/{c}/matching-properties` | `Crm\ProspectMatchController::forCustomer` | biens de l'agence qui correspondent |
| GET | `properties/{p}/matching-customers` | `Crm\ProspectMatchController::forProperty` | prospects de l'agence qui correspondent (compte + liste) |
| GET | `tasks?filter[due]=overdue\|today\|upcoming\|none` | `TaskController::index` | + `taskable: {type: customer\|property, id, label}` dans la réponse |
| POST/PUT/DELETE | `tasks`, `tasks/{t}` | `TaskController::store/update/destroy` | assigné = soi ou personnel de l'agence du `taskable` (422 `task_assignee_not_staff`), **aussi** au `PUT` ; `DELETE` = créateur seul (`TaskPolicy::delete`) |
| PUT | `properties/{p}/assigned-agent` | `PropertyController::assignAgent` | désigne l'**agent responsable** selon l'ADR « agent responsable » (Delta 0) — **n'écrit jamais `properties.user_id`** ; cible jugée par la règle de TCK-587 (§3 : personnel **actif** de l'agence du bien, sinon 422 `messages.target_user_not_in_active_agency`) ; ensuite, `GET properties/{p}` rend `primary_contact` = la cible et `owner` inchangé (`primary_contact` n'est rendu qu'en détail, `PropertyResource.php:39-41`, `:160`) |
| DELETE | `agencies/{a}/members/{u}` | `AgencyController::removeAgent` | membre du personnel (agent **ou** admin d'agence) ; bailleur → 422 `member_not_staff` ; capacité `team.remove` |
| GET | `calendar?types[]=…&mine=1` | `CalendarController::index` | types `task`, `lease_event`, `maintenance` en plus ; fenêtre ≤ 186 jours (422 au-delà) |
| POST/DELETE | `me/calendar-feed` | `CalendarFeedController::store/destroy` | crée / fait tourner / révoque le lien d'abonnement (rendu **une seule fois**) |
| GET | `calendar-feed/{token}.ics` | `CalendarFeedController::show` | public, `text/calendar`, limité en débit — forme exacte tranchée par l'ADR |
| POST | `properties/bulk-visibility` | `PropertyController::bulkVisibility` | dépublier en lot (`visibility=private` seulement) |
| POST | `properties/bulk-assign` | `PropertyController::bulkAssign` | changer l'agent responsable en lot — même service que l'unitaire, `user_id` jamais écrit |
| GET | `agencies/{a}/members/{u}/portfolio` | `Agency\AgentHandoverController::show` | inventaire du portefeuille, compté par type |
| POST | `agencies/{a}/members/{u}/handover` | `Agency\AgentHandoverController::store` | passation (repreneur unique ou par type), puis retrait si demandé |

Les deux `bulk-*` rendent la forme de `bulk-archive` : `updated`, `updated_ids`, `failed[{id, reason}]`
avec `reason` ∈ `not_found | forbidden | invalid_target | unchanged` — des **codes**, jamais de
prose (`invalid_target` : `bulk-assign` seulement, même règle que le 422 unitaire ; `unchanged` en
`bulk-assign` = la cible est déjà l'agent responsable).
Au plus 100 identifiants par appel.

## Direction UX / Artistique

Console « Ancrage Local Contemporain » (`docs/design-guidelines.md`), pensée **d'abord pour un
téléphone tenu d'une main, entre deux visites**.

- **Joindre** : « Appeler » et « WhatsApp » sont les deux gestes les plus visibles d'une fiche client,
  d'une carte de pipeline et d'une tâche rattachée à un client — cibles ≥ 44 px, au pouce. WhatsApp
  ouvre un message prérempli (prénom, bien concerné) dans la langue de l'interface. Un client sans
  numéro joignable montre pourquoi, pas un bouton grisé muet.
- **Doublon** : à la création, le doublon se montre comme une aide (« Awa Diop existe déjà avec ce
  numéro — ouvrir sa fiche ») avec un choix explicite de créer quand même ; jamais une erreur rouge.
- **Pipeline** : changer d'étape se fait sans glisser — depuis la carte et depuis la fiche — au
  clavier comme au doigt, avec le motif demandé pour « perdu » comme aujourd'hui. Les compteurs
  disent le total réel ; une colonne longue se prolonge à la demande.
- **Mes tâches** : trois temps lisibles d'un coup d'œil (en retard, aujourd'hui, à venir), cocher
  pour terminer, chaque tâche dit à quoi elle se rattache et y mène.
- **Fiche client** : une seule fiche ; le tiroir du pipeline en est une vue réduite, pas un double.
  L'activité dit qui a fait quoi en phrases, jamais des noms de colonnes.
- **Correspondances** : sur un bien, « 4 prospects correspondent » mène à la liste ; sur un
  prospect, la sélection se partage par WhatsApp (liens publics seulement).
- **Calendrier** : chaque type a sa couleur et sa légende (la charte de TCK-582) ; « Mes
  rendez-vous » est actif par défaut pour l'agent. L'abonnement se présente comme un geste simple
  (copier le lien, ajouter à Google / Apple Agenda), avec la révocation à côté.
- **Actions en masse** : le bilan est chiffré et nommé (« 12 archivés, 2 refusés : déjà archivé,
  droits insuffisants ») ; seuls les refus restent sélectionnés.
- **Passation** : un assistant qui montre d'abord ce que l'agent laisse (comptes par type), propose
  un repreneur unique ou un par type, résume avant de confirmer, puis seulement retire.
- **Retirer** : le geste n'apparaît que là où il aboutit (agent, admin d'agence) ; un bailleur ne se
  « retire » pas de l'agence depuis cette console.
- **Réattribuer** se dit « changer l'agent responsable » : la fiche et la liste montrent côte à
  côte le propriétaire (inchangé) et l'agent responsable (changé) ; rien dans le geste ne laisse
  croire que le bien change de main.
- **Activité indisponible** : une erreur de chargement se dit et se relance ; elle ne se confond
  jamais avec « aucune activité ».
- **Bailleur** : il ne se voit proposer ni de créer un client, ni le pipeline de l'agence ; ce qu'il
  voit du CRM se limite aux fiches qu'il a lui-même ajoutées.
- **Prestataire** : le raccourci « Calendrier » ouvre un agenda de ses seules interventions.

## Contraintes strictes (métier)

1. **Cloisonnement** : toute lecture et écriture reste dans l'agence du profil actif. Le
   rapprochement, le calendrier, les `bulk-*`, le référent et la passation jugent le **personnel de
   l'agence** (agent | admin d'agence) par le prédicat de TCK-587 ; avant sa fusion, l'expression
   équivalente `isAgentAt || isAgencyAdminAt` avec un commentaire `TCK-587` (règle commune 3). Un
   bailleur n'est jamais repreneur, référent, assigné d'une tâche, ni cible d'une réattribution, et
   ne lit du CRM que ses propres ajouts. Une affectation (`agent_id`, `assigned_to_id`) ne donne
   **aucune** lecture hors de l'agence où l'on est personnel : la quitter éteint ce qu'elle ouvrait.
   **Réattribuer change l'agent responsable, jamais le propriétaire** (consolidation du
   2026-10-06, remplace la règle `owner_held` de la passe précédente) : `assignAgent` et
   `bulk-assign` n'écrivent **jamais** `properties.user_id` ; l'agent responsable vit là où l'ADR
   « agent responsable » le place (Delta 0). Un bien tenu par un bailleur se réattribue donc comme
   un autre : son bailleur reste propriétaire, bailleur des baux à venir, et le voit à son tableau
   de bord. Hors création, les **seules** écritures de `user_id` admises sont la passation d'un bien
   **saisi par le partant** (`user_id` = lui, membre du personnel) vers un repreneur du personnel de
   la même agence (question 2 de l'ADR) — jamais d'un bailleur, jamais vers un bailleur — et la
   commande de réparation, qui rétablit le titulaire d'origine.
2. **Les `bulk-*` n'inventent aucune règle** : chaque ligne passe par la **même** autorisation que
   l'endpoint unitaire (`update` de `PropertyPolicy`, réécrite par TCK-587) ; la transaction ne
   couvre que le sous-ensemble autorisé ; un refus ne touche pas la base. Pas de publication en lot
   (la modération s'y applique bien par bien).
3. **Passation = une transaction**, journalisée (`activity('AgentHandover')`, une entrée par
   catégorie avec les identifiants déplacés) ; échec → rien n'a bougé. Les deux chemins de retrait
   (`AgencyController::removeAgent` et `AgentInvitationService::remove`) passent par le même service
   ; un retrait **avec** portefeuille non vide exige une passation explicite ou un
   `leave_unassigned=true` assumé. Collision sur `property_collaborators (property_id, user_id)` :
   la ligne du repreneur est conservée, celle du partant supprimée. Une intervention dont le
   repreneur n'est pas éligible à la règle de TCK-592 est **désassignée**, et comptée comme telle.
   Biens : la passation déplace la **marque d'agent responsable** du partant vers le repreneur
   (catégorie `responsible_properties`) et, séparément, le **titulariat** des seuls biens dont
   `user_id` = le partant (catégorie `held_properties`, question 2 de l'ADR) ; un bien dont
   `user_id` est un bailleur n'y voit jamais sa colonne `user_id` changer.
4. **Absence** : bornée par des dates, révocable, journalisée ; elle ne modifie aucune ligne
   existante — elle route les **nouvelles** assignations et donne au remplaçant la vue des tâches de
   l'absent pendant la période. Elle ne crée aucun droit que le remplaçant ne détient pas.
5. **Téléphone** : normalisé à l'écriture en E.164 (`+221` par défaut pour un numéro national),
   jugé par `TelephoneJoignable` ; un numéro existant non normalisable n'est **jamais** effacé —
   il est signalé par `crm:normalize-customer-phones --dry-run`.
6. **Flux iCalendar** : jeton aléatoire stocké **haché**, révocable, à usage de lecture seule, sans
   donnée personnelle de tiers dans les événements (pas de nom ni de téléphone de visiteur ou de
   locataire) ; journal du dernier accès. C'est une **nouvelle méthode d'authentification** : ADR.
7. **Aucune prose dans l'API** (règle commune 1) : notification de correspondances, motifs, erreurs
   en clés `__()` ; 591 convertit les littéraux des fichiers qu'il touche (`CustomerController`
   l.100-101 et l.192-193 — par la colonne `customer_notes.kind`, pas par une traduction figée en
   base —, `CalendarController` l.51, `TaskController` l.89). Clés i18n en ajout seul, dans un bloc
   `crm.*` / `calendar.*` / `team.handover.*` propre au ticket.
8. **Migrations** : index et FK nommés (< 63 caractères), `down()` exact ; aucune `enum()` ; `jsonb`.
9. **Coordination vague 73** — ce ticket ne prend que son territoire de la CARTE, plus quatre
   sites non revendiqués : `AgencyController::removeAgent` (l.225-266), `PropertyController::assignAgent`
   (l.238-259) + `AssignAgentPropertyRequest` (règles seulement), `TaskPolicy` (`attachTo`, nouvelle
   `delete`) + `UpdateTaskRequest`, et la condition d'affichage de « Retirer » dans `AdminUsersTable`
   (l.276-286) :
   - **587** possède `CustomerPolicy`, `PropertyPolicy`, `TeamConsole` (libellés) et la garde
     « capacité sans lecteur » : 591 devient lecteur de `crm.assign` et de `team.remove` (587 les
     inscrit à son inventaire au nom de 591 ; 591 retire leurs lignes dans son commit).
     `CustomerPolicy` : 587 réécrit `view`/`delete` ; **seul le bloc d'une nouvelle méthode
     `create` est à 591** (conflit de lignes voisines, ordre de fusion indifférent).
     `CustomerController::index` : **la clause `where` est à 591** (TCK-587 Contraintes 9 laisse
     l'arbitrage à la session ; ce ticket la prend). Elle écrit **exactement** la règle de
     `CustomerPolicy::view` réécrite par 587 (auteur, ou personnel de l'agence titulaire de
     `crm.view_all`), dans une portée `Customer::scopeVisibleTo(User)` partagée par `index` et
     `PipelineStatsService` ; un test vérifie que **chaque** ligne rendue passe `view`. Si 587 n'est
     pas fusionné, la portée porte un commentaire `TCK-587`.
     `PropertyController` : 587 possède l'autorisation de `store/destroy/publish/unpublish` et le
     `where` d'`index` ; **`assignAgent` (corps) et les routes `bulk-*` sont à 591**.
     **La règle de cible d'`assignAgent` est à 587** (TCK-587 Delta §3, l.375-378 : cible =
     personnel **actif** de l'agence du bien, prédicat `staffAgencyId()` appliqué à la cible, sinon
     422 `messages.target_user_not_in_active_agency` ; AC5b, agent suspendu compris), « exposée en
     une méthode que le `bulk-assign` de TCK-591 réutilise » (l.378) — vérifié par grep le
     2026-10-06. 591 ne la réécrit pas : `assignAgent` et `PropertyBulkAssignService` l'appellent,
     le second la traduit en `invalid_target`. Si 591 fusionne avant 587, 591 pose cette méthode
     (`App\Services\Property\AssignableAgentRule::allows(Property, User): bool`, commentaire
     `TCK-587`) et 587 n'en change que le corps. ⚠ TCK-587 l.378 décrit la cible comme celle « qui
     devient `properties.user_id` » : c'est le comportement que 591 supprime ; seule la règle de
     cible de 587 est reprise, pas l'écriture de `user_id` (signalé à la session).
   - **590** possède les écrans visites et leads : ils adoptent le même geste « Appeler / WhatsApp »,
     la conversion lead → client passe par la normalisation et le détecteur de doublons de 591, et
     le routage des leads/visites consomme le résolveur d'absence. L'onglet Visites de la fiche
     dépend du périmètre de `PropertyVisitController::index` (590).
   - **592** possède tout `Maintenance*` : 591 ne fait que lire `MaintenanceRequest` (calendrier,
     par `MaintenanceRequest::scopeVisibleTo()` que 592 livre — sinon l'expression équivalente
     commentée `TCK-592`) et écrire `assigned_to` à la passation, sous sa règle d'éligibilité.
   - **595** possède `overview/*` : 591 n'y change que l'`href` de « Tâches du jour » (une ligne).
   - **504** : le drapeau de collaborateur principal, s'il existe, suit le collaborateur.
     **Option retenue par défaut de l'ADR « agent responsable » : la marque de 504 EST l'agent
     responsable.** `assignAgent`, `bulk-assign` et la passation l'écrivent par le service que 504
     livre (désignation du principal) ; ordre de fusion : **504 d'abord** pour les cases de §7 et
     §8 qui touchent aux biens — le reste de 591 n'attend pas. Si 504 n'est pas fusionné quand 591
     arrive à §7, la session tranche entre avancer 504 (P2 → vague 73) ou laisser 591 poser la
     migration et le service de 504 (Delta 504 l.70-73), 504 gardant son front (« À attribuer »).
   - **446** statue dans la spec sur le calendrier du prestataire. **Option retenue par défaut :
     oui** — 591 ouvre la page au prestataire avec le seul type `maintenance`, parce que le
     raccourci le lui promet déjà (`DashboardShortcuts.tsx:78`) ; 446 consigne la décision dans la
     spec. Si le porteur tranche « non » avant l'implémentation, 591 retire le raccourci à la place
     et l'AC27 s'inverse (le raccourci n'est plus proposé).
   - **D-66** (dette, décision du porteur) : la branche collaborateur du calendrier est **conservée
     telle quelle** — ni élargie (lecture par les collaborateurs différée), ni retirée.

## Delta à produire

**0. Décisions préalables**
- [ ] ADR à écrire et accepter **avant le code** : *« Comment un agenda sort-il de la plateforme ? »*
      — lien secret par utilisateur (table `calendar_feeds` : `user_id`, `agency_id`, `token_hash`,
      `revoked_at`, `last_accessed_at` ; option retenue par défaut) contre jeton Sanctum à portée
      restreinte ;
      contenu des événements ; durée de vie ; révocation au retrait de l'agent.
- [ ] ADR à écrire et accepter **avant le code** : *« Comment dit-on qu'un agent est absent, et qui
      reprend ? »* — option retenue par défaut : étendre `role_delegations` d'une colonne `replaces_user_id`
      (FK `role_delegations_replaces_user_fk`, nullable) et réutiliser activation / expiration /
      évènements ; alternative : table `agent_absences`. Trancher aussi les effets (routage des
      nouvelles assignations, vue des tâches).
- [ ] ADR à écrire et accepter **avant le code de §7 et des catégories de biens de §8** :
      *« Où vit l'agent responsable d'un bien, distinct de son propriétaire ? »* (consolidation du
      2026-10-06 — `properties.user_id` est le propriétaire, `docs/models-spec.md:380`, et aucune
      colonne ne porte l'agent responsable). Options : **(A, option retenue par défaut)** le
      collaborateur `agent` marqué principal de TCK-504 — une seule définition, celle que
      `PrimaryPropertyContact` sert déjà à la carte, au téléphone public, aux messages et aux leads
      (TCK-502), `commission_share` déjà porté par la ligne ; **(B)** une colonne
      `properties.responsible_agent_id` (FK nullable, `nullOnDelete`, index nommé) — un second
      « responsable » qui divergerait de `PrimaryPropertyContact`, exactement l'écart que TCK-502 a
      fermé ; **(C)** statu quo (`user_id`) — écarté, c'est le défaut. **Question 2** du même ADR :
      *que devient `user_id` d'un bien saisi par un agent qui quitte l'agence ?* — option retenue
      par défaut : la passation le transmet à un repreneur du personnel de la même agence (sinon
      l'ancien agent garde lecture et écriture par `PropertyPolicy.php:48`, `:102`, et reste
      bailleur des baux à venir par `LeaseService.php:32`) ; c'est la **seule** écriture de
      `user_id` hors création. Le sens de `user_id` sur un bien saisi par le personnel pour un
      propriétaire sans compte (mandat) reste celui de la spec, non tranché ici.

**1. Numéro fiable et geste de contact (A9)**
- [ ] `App\Services\Crm\CustomerPhoneNormalizer` (s'appuie sur `PhoneNumber`, `+221` par défaut),
      appelé par des mutateurs de `Customer` sur `phone` et `emergency_contact_phone` — tout chemin
      d'écriture normalise (formulaire, `CustomerService::findOrCreateFromUser`, conversion de lead
      de 590) ; `TelephoneJoignable` sur ces deux champs dans `Store/UpdateCustomerRequest`.
- [ ] `App\Services\Crm\CustomerDuplicateDetector` (même agence, téléphone normalisé ou e-mail replié)
      → 409 `customer_duplicate` ; champ `allow_duplicate` (bool) dans les deux FormRequests.
- [ ] Commande `crm:normalize-customer-phones {--dry-run}` : compte normalisés / non normalisables.
- [ ] Front : saisie de téléphone du profil (TCK-574) dans le formulaire client ; gestes « Appeler » et
      « WhatsApp » sur la fiche, la carte de pipeline et la tâche ; doublon présenté comme une aide.

**2. Pipeline (A10)**
- [ ] Front : changement d'étape sans glisser (carte et fiche), capteur clavier et annonces
      accessibles, pagination « charger plus » (la `meta` de pagination n'est plus jetée), compteurs
      d'onglet et de colonne tirés de `stage_counts`.

**3. Tâches (A11)**
- [ ] `Task` : filtre `due` (`AllowedFilter::callback`, fuseau `Africa/Dakar`) ; `TaskController::format`
      ajoute `taskable {type, id, label}`.
- [ ] `TaskController::authorizeAssignee` : assigné = soi, ou **personnel** de l'agence du
      `taskable` (`isOwnerAt` retiré) ; erreur 422 par clé `__('errors.tasks.assignee_not_staff')`,
      code `task_assignee_not_staff`. **Rejoué dans `update`** dès que `assigned_to_id` change.
- [ ] `TaskPolicy::delete` (créateur ou super-admin) ; `TaskController::destroy` →
      `authorize('delete', $task)`. L'assigné garde `update` (cocher, commenter).
- [ ] `TaskPolicy::attachTo` délègue à la policy du parent : `can('view', $customer)` (règle de
      587) / `can('update', $property)` — plus de lecture de `$user->agency_id`. Le `taskable.label`
      n'est rendu qu'à qui passe ce même contrôle.
- [ ] Front : page « Mes tâches » (filtres, cocher, créer une tâche sur un client ou un bien) ; lien
      « Tâches du jour » du tableau de bord agent vers elle (`/app/tasks?filter[due]=today`).

**4. Fiche client unique (A12)**
- [ ] `CustomerController::activity` + route `customers.activity` (journal du client, de ses notes et
      de ses tâches, mêmes champs exclus que l'`Auditable` de `Customer`) ; relation `Customer::visits()`.
- [ ] `Auditable` sur `CustomerNote` et `Task` (sans `body`/`description` dans les propriétés
      journalisées : le journal dit « note ajoutée », pas son contenu).
- [ ] Migration `add_kind_to_customer_notes_table` (cf. Contrat) ; `update` et `updatePipelineStage`
      écrivent `kind` + le motif seul ; plus de `'Conversion : '` / `'Perte : '` dans le code.
- [ ] Front : une seule fiche (aperçu, notes, tâches, activité, visites, réservations, baux,
      documents, relations) ; le tiroir en est la vue réduite ; plus d'appel à `/api/audit-log` ;
      une erreur de chargement de l'activité est montrée (et relançable), jamais rendue en liste
      vide ; le préfixe des notes `conversion`/`loss` est traduit à l'affichage.

**5. Critères et rapprochement (A13)**
- [ ] Migration `add_search_criteria_to_customers_table` (cf. Contrat) ; `$fillable`, casts,
      `$queryFields`, règles dans les deux FormRequests (`budget_min ≤ budget_max`).
- [ ] `App\Services\Crm\ProspectMatcher` — SQL sur les biens de l'agence (`addresses` pour ville et
      quartier), prospects `active` hors `converted`/`lost` ; `Crm\ProspectMatchController`.
- [ ] Job `SendProspectMatchDigest` (quotidien, planifié) : biens publiés ou dont le prix a changé
      (`PropertyPriceHistory`) depuis 24 h → une notification par référent (sinon `added_by`), par
      clé `__()`, jamais vide.
- [ ] Front : critères sur la fiche ; « N prospects correspondent » sur la fiche bien ; partage
      WhatsApp de la sélection.

**6. Calendrier (A16, P17)**
- [ ] `IndexCalendarRequest` : `types.*` `in:booking,visit,task,lease_event,maintenance`, `mine`
      (bool), fenêtre ≤ 186 jours.
- [ ] `CalendarController` : périmètre réécrit sur le prédicat « personnel de l'agence » (bailleur :
      ses biens seulement) ; la branche `agent_id = moi` (l.128) n'est retenue **que** pour un bien
      d'une agence où l'appelant est personnel ; branche collaborateur inchangée (D-66) ; refus
      l.51 par clé `__('errors.calendar.cross_agency_forbidden')` ; `task` (personnelles, `due_at`), `lease_event` (`end_date`,
      `renewal_date`), `maintenance` (`scheduled_at` ; personnel : biens de l'agence ; prestataire :
      `assigned_to = moi`) ; `mine=1` = `agent_id`/`assigned_to_id`/`assigned_to` = moi.
- [ ] `CalendarFeedController` + `IcsCalendarRenderer` selon l'ADR ; révocation des flux au retrait.
- [ ] Front : types, légende et filtre « Mes rendez-vous » ; abonnement ; la page s'ouvre au
      prestataire (option retenue par défaut, cf. Contraintes 9 / 446) et ne lui demande que le type
      `maintenance` — le raccourci de `DashboardShortcuts.tsx:78` cesse de mener à une redirection.

**7. Actions en masse (A17)**
- [ ] `PropertyBulkVisibilityRequest`, `PropertyBulkAssignRequest` ; `PropertyBulkVisibilityService`,
      `PropertyBulkAssignService` sur le modèle de `PropertyBulkArchiveService` ; routes déclarées
      avant `{property}` (`routes/api/properties.php:19`).
- [ ] `PropertyController::assignAgent` (corps, l.238-259) : **supprimer**
      `$property->update(['user_id' => $target->id])` (l.254) ; à la place, désigner la cible
      **agent responsable** selon l'ADR « agent responsable » (Delta 0 ; option retenue par défaut :
      la cible devient le collaborateur `agent` marqué principal par le service de TCK-504 — ligne
      `property_collaborators` créée si absente, `role = agent`, `invited_at = now()` ; une ligne
      existante d'un autre rôle : traitement tranché par l'ADR, 504 n'admettant que `agent` en
      principal ; l'ancien principal reste collaborateur, sans la marque, `commission_share`
      intact). Le tout sous
      `DB::transaction`, ligne parent verrouillée (`Property::whereKey()->lockForUpdate()`, piège
      PostgreSQL n°2). La réponse charge `owner` et `PrimaryPropertyContact::eagerLoads()`.
- [ ] Règle de cible : celle de **TCK-587** (Contraintes 9), appelée par `assignAgent` **et** par
      `PropertyBulkAssignService` — 591 ne la réécrit pas ; en lot, son refus devient
      `invalid_target`. Le contrôle maison l.247-251 (`$target->agency_id === $agencyId`) disparaît.
- [ ] `PropertyBulkAssignService` : même désignation que l'unitaire (un seul service
      `App\Services\Property\ResponsibleAgentAssigner::assign(Property, User $target, User $actor)`
      appelé par les deux), **jamais** d'écriture de `user_id` ; cible déjà responsable →
      `unchanged`. Journal : `activity('Property')`, évènement `responsible_agent_changed`
      (`property_id`, ancien et nouveau responsable) — la trace qui manquait au geste.
- [ ] **Réparation des biens déjà réattribués** — commande
      `properties:repair-reassigned-owners {--dry-run}` (idempotente). Source : `activity_log`
      `log_name = 'Property'`, `event = 'updated'`, `properties->'old'->>'user_id'` ≠
      `properties->'attributes'->>'user_id'` (seul `assignAgent` produit cette signature, cf.
      Contexte 7). Pour chaque bien : `user_id` ← la **première** valeur `old` de la chaîne (le
      titulaire d'origine) ; la **dernière** cible devient agent responsable par
      `ResponsibleAgentAssigner` si elle est encore du personnel de l'agence ; les baux du bien
      créés après la première réattribution dont `landlord_id` = une cible : `draft` → `landlord_id`
      rétabli ; tout autre statut **listé, jamais réécrit** (un bail signé est un document
      contractuel — à traiter à la main). Sortie : comptes `restored`, `leases_fixed`,
      `leases_to_review` (avec identifiants). **Environnements** : aucune production API
      (`hebergement.md:23`) — rien à réparer en production ; la commande se joue **une fois sur la
      préproduction** `takussan_preview` (`hebergement.md:80`) après le déploiement de 591,
      `--dry-run` d'abord, résultat consigné dans les Notes d'implémentation ; une remise à zéro
      par le seed (`hebergement.md:213`) la rend sans objet. En local, `migrate:fresh --seed` suffit.
- [ ] Front : les trois actions passent par `bulk-*` ; bilan chiffré et motivé (`invalid_target`
      dit que la cible n'est pas du personnel actif de l'agence) ; seuls les refus restent
      sélectionnés ; la liste est rafraîchie dès qu'au moins un bien a changé, succès partiel
      compris. Le geste s'intitule « Changer l'agent responsable » ; la liste et la fiche distinguent
      propriétaire et agent responsable (`owner` / `primary_contact`).

**8. Passation et absence (AD14)**
- [ ] `App\Services\Agency\AgentHandoverService` (`inventory()`, `transfer()`) ; `AgentHandoverController`
      + `StoreAgentHandoverRequest` (repreneur unique ou par catégorie, `leave_unassigned`,
      `remove_after`) ; autorisation par `team.remove`. Catégories de biens (Contraintes 3) :
      `responsible_properties` → `ResponsibleAgentAssigner` vers le repreneur (jamais `user_id`) ;
      `held_properties` (`user_id` = le partant) → `user_id` ← repreneur du personnel de la même
      agence, selon la question 2 de l'ADR « agent responsable ». Un bien dont `user_id` est un
      bailleur n'entre dans aucune des deux catégories par son `user_id`.
- [ ] `App\Services\Agency\AgencyMemberRemovalService::remove(Agency, User $member, User $actor, bool
      $leaveUnassigned)` — **seul** chemin de retrait : `AgencyController::removeAgent` et
      `AgentInvitationService::remove` y délèguent. Il garde les deux gardes actuelles
      (`primary_admin_id`, dernier admin sous verrou, `AgencyController.php:230-260`), accepte un
      membre portant un `AgentProfile` **ou** un `AgencyAdminProfile` dans l'agence (bailleur seul →
      422 `member_not_staff`), refuse un portefeuille non vide sans passation ni `leave_unassigned`
      (422 `portfolio_not_empty`), journalise `agent_removed` / `agency_admin_removed`
      (`activity('Membership')`, propriétés `agency_id`, profils supprimés, `leave_unassigned`) et
      révoque les flux iCalendar du membre dans l'agence.
- [ ] Autorisation du retrait par la capacité `team.remove` dans l'agence de la route (au lieu de
      `can('update', $agency)`, `AgencyController.php:274-277`) — lecteur de la capacité.
- [ ] Front : « Retirer de l'agence » n'est proposé que sur un membre du personnel (agent, admin
      d'agence), jamais sur un bailleur seul.
- [ ] `SetPrimaryContactCustomerRequest` : `user_id` = personnel de l'agence du client ; capacité
      `crm.assign` ; front : désigner le référent depuis la fiche.
- [ ] Absence selon l'ADR (migration, service, résolveur `AgentAvailability::substituteFor()`),
      `TaskPolicy::view` étendu au remplaçant pendant la période.
- [ ] Front : assistant de passation déclenché par « Retirer » ; « Déclarer une absence ».

**9. Cloisonnement du CRM (passe de correction)**
- [ ] `Customer::scopeVisibleTo(User)` (règle de `CustomerPolicy::view` réécrite par 587 : super-admin
      → tout ; personnel de l'agence titulaire de `crm.view_all` → l'agence ; sinon → `added_by_id =
      moi`) ; `CustomerController::index` et `PipelineStatsService::scopedQuery` l'emploient — plus de
      `$user->agency_id` dans ces deux fichiers.
- [ ] `CustomerPolicy::create` (personnel de l'agence du profil actif, ou super-admin — bloc neuf,
      cf. Contraintes 9) ; `StoreCustomerRequest::authorize` → `can('create', Customer::class)` ;
      `store` écrit `agency_id` = l'agence où l'appelant est personnel.
- [ ] Front : ni « Ajouter un client » ni lien vers le pipeline pour un compte qui n'est pas du
      personnel ; ses fiches existantes restent lisibles.

**10. Tests**
- [ ] `CustomerScopeTest`, `TaskAuthorizationTest`, `CustomerNoteKindTest`, `PropertyAssignAgentTest`,
      `AgencyMemberRemovalTest`, `CustomerPhoneAndDuplicateTest`, `CustomerActivityEndpointTest`, `PrimaryContactScopeTest`,
      `ProspectMatcherTest`, `SendProspectMatchDigestTest`, `TaskDueFilterTest`,
      `CalendarScopeTest`, `CalendarNewTypesTest`, `CalendarFeedTest`, `PropertyBulkVisibilityTest`,
      `PropertyBulkAssignTest`, `AgentHandoverTest`, `AgentRemovalJournalTest`, `AgentAbsenceTest`,
      `PropertyReassignmentKeepsOwnerTest`, `RepairReassignedOwnersCommandTest` ;
      vitest des écrans touchés.

## Critères d'acceptation

- [ ] AC1 — `POST /api/customers` avec `phone="77 123 45 67"` enregistre `+221771234567` ;
      `phone="+330612345678"` rend 422 ; un second client de la même agence avec `"+221 77 123 45 67"`
      rend **409** `customer_duplicate` dont `existing[0].id` est le premier ; même appel avec
      `allow_duplicate=true` → 201 ; dans une **autre** agence → 201. Idem pour `AWA@x.sn` contre
      `awa@x.sn`.
- [ ] AC2 — **sécurité, prouvé par ablation** : un utilisateur dont le seul profil dans l'agence A est
      `OwnerProfile` reçoit, sur `GET /api/calendar`, les événements de **ses** biens et **aucun**
      d'un bien de A dont il n'est pas propriétaire ; le test rougit sur le code actuel et redevient
      rouge si l'on remet `$user->agency_id` dans le périmètre.
- [ ] AC3 — **sécurité, prouvé par ablation** : `POST customers/{c}/primary-contact` avec l'`user_id`
      d'un agent d'une autre agence, ou d'un bailleur de la même agence, rend 422 ; sans `crm.assign`,
      403. Rouge sur le code actuel.
- [ ] AC4 — **sécurité, prouvé par ablation** : `bulk-assign` vers un bailleur de l'agence rend ce bien
      en `failed` avec `invalid_target`, ne modifie ni `user_id` ni l'agent responsable ; vers un agent
      **suspendu** de l'agence, idem. Le refus vient de la règle de cible de **TCK-587** (Delta §3,
      AC5b), que `PropertyBulkAssignService` appelle (Contraintes 9) : on remplace l'appel par
      `true` → le bien passe en `updated`, rouge.
- [ ] AC5 — sur 5 biens dont 1 d'une autre agence et 1 déjà privé, `bulk-visibility` rend
      `updated = 3`, `failed` = `[{forbidden}, {unchanged}]` + l'identifiant inconnu en `not_found` ;
      une exception levée au 2ᵉ bien autorisé laisse les 3 inchangés (transaction).
- [ ] AC6 — `GET /api/customers/{c}/activity` rend **200** à un agent de l'agence avec **exactement**
      trois entrées pour le jeu du test (le changement d'étape du client, la note ajoutée, la tâche
      créée — les deux dernières exigent `Auditable` sur `CustomerNote` et `Task` ; on retire le
      trait → 2 entrées, rouge) ; aucune entrée ne contient le `body` de la note ; **403** à un agent
      d'une autre agence.
- [ ] AC7 — `GET /api/tasks?filter[due]=overdue` sur un jeu fixé (une tâche hier ouverte, une hier
      terminée, une aujourd'hui, une demain) rend **exactement** la première ; `today` → la
      troisième ; chaque ligne porte `taskable.label`.
- [ ] AC8 — `GET /api/calendar?types[]=task&types[]=lease_event&types[]=maintenance&mine=1` rend,
      pour l'agent, ses tâches, la fin et le renouvellement des baux de l'agence dans la fenêtre, et
      les interventions planifiées des biens de l'agence ; une fenêtre de 200 jours → 422.
- [ ] AC9 — un prestataire assigné à une intervention planifiée la reçoit en type `maintenance`, et
      aucune autre intervention de l'agence.
- [ ] AC10 — le flux `.ics` est un VCALENDAR valide, ne contient ni nom ni téléphone de visiteur ;
      après révocation, ou après retrait de l'agent, il rend 404 ; le jeton n'est pas stocké en clair.
- [ ] AC11 — un prospect `{contract_type: rent, budget_max: 300000, cities: [Dakar], min_bedrooms: 2}`
      correspond à un bien de l'agence à 250 000 / Dakar / 3 chambres, privé compris, et à **aucun**
      bien d'une autre agence ni à 350 000 ; le récapitulatif quotidien notifie son référent une
      fois, et personne quand rien ne correspond.
- [ ] AC12 — passation d'un agent portant 3 tâches, 2 visites à venir, 1 intervention, 2
      collaborations (dont une où le repreneur collabore déjà), 1 bien dont il est agent responsable
      et dont `user_id` est un **bailleur** B, 1 bien qu'il a saisi (`user_id` = lui) et 2 clients
      référents : après `POST …/handover`, tout est au repreneur — agent responsable du bien de B
      (`PrimaryPropertyContact::for` = repreneur) **avec `user_id` toujours = B**, `user_id` du bien
      saisi = repreneur —, la collaboration en double n'existe qu'une fois, `activity_log` porte une
      entrée par catégorie ; une erreur injectée à mi-parcours ne déplace rien.
- [ ] AC13 — `DELETE /api/agencies/{a}/members/{u}` sur un agent au portefeuille non vide, sans
      passation ni `leave_unassigned`, rend 422 `portfolio_not_empty` ; avec, il journalise
      `agent_removed` (rouge sur le code actuel, qui ne journalise pas). Un agent tenant un rôle
      personnalisé **avec** `team.remove` retire un collègue (200 ; 403 aujourd'hui) ; un admin dont
      le rôle **retire** `team.remove` reçoit 403 (200 aujourd'hui). `primary_admin_id` et dernier
      admin : 422 inchangés. Après retrait, le flux iCalendar du retiré rend 404.
- [ ] AC14 — pendant une absence active de X remplacé par Y, Y voit les tâches de X et le résolveur
      rend Y ; après la date de fin, plus rien ; aucune ligne existante n'a changé.
- [ ] AC15 — front : depuis un écran de 360 px, au clavier comme au doigt, l'agent change l'étape
      d'un client, coche une tâche, et ouvre WhatsApp sur le bon numéro avec le message prérempli ;
      la console ne contient plus d'appel à `/api/audit-log` depuis la fiche client.
- [ ] AC16 — **sécurité, prouvé par ablation** (CRM) : agence A avec 3 clients ajoutés par un agent
      et 1 ajouté par un bailleur B de A (seul profil `OwnerProfile`). `GET /api/customers` par B rend
      **exactement** l'identifiant de sa fiche (4 aujourd'hui) ; `GET /api/customers/pipeline-stats`
      par B rend `stage_counts` de somme **1** ; un agent de A du rôle système (`crm.view_all`) en
      voit 4 ; un second agent de A, d'un rôle personnalisé sans `crm.view_all` et qui n'a rien
      ajouté, en voit **0**. Chaque ligne rendue passe `CustomerPolicy::view`.
      Rouge si l'on remet `$user->agency_id` dans `index` ou dans `PipelineStatsService`.
- [ ] AC17 — **sécurité** : `POST /api/customers` par un compte sans profil → **403** ; par un
      bailleur de A → **403** (201 aujourd'hui dans les deux cas) ; par un agent de A → 201 avec
      `agency_id = A`.
- [ ] AC18 — **sécurité, prouvé par ablation** (tâches) : `POST /api/tasks` avec `assigned_to_id`
      d'un bailleur de A → 422 `task_assignee_not_staff` (201 aujourd'hui) ; `PUT /api/tasks/{t}` avec
      l'`assigned_to_id` d'un agent d'une **autre** agence → 422 (200 aujourd'hui) ; `DELETE` par
      l'assigné non créateur → **403** (204 aujourd'hui), par le créateur → 204 ; `POST /api/tasks`
      par un bailleur de A sur un client de A qu'il n'a pas ajouté → **403** (201 aujourd'hui) et la
      réponse ne contient pas son nom.
- [ ] AC19 — `PATCH /api/customers/{c}/pipeline-stage` vers `lost` avec `reason = "Budget"` crée une
      note épinglée `kind = loss`, `body = "Budget"` (aujourd'hui `"Perte : Budget"`) ; idem par
      `PUT /api/customers/{c}` vers `converted` (`kind = conversion`). La migration convertit une note
      existante `"Perte : X"` en `kind = loss`, `body = "X"`, et son `down()` la restaure à
      l'identique. Front (vitest) : en `en`, la note s'affiche « Lost: Budget » ; en `fr`,
      « Perte : Budget ». `grep -n "'Perte : '\|'Conversion : '" takussan-api/app` → vide.
- [ ] AC20 — refus traduits : `GET /api/calendar?agency_id=…` par un non-super-admin rend 403 dont le
      `message` vaut `__('errors.calendar.cross_agency_forbidden')` dans la locale demandée — **deux
      chaînes différentes** en `fr` et `en` (aujourd'hui la même chaîne anglaise) ; même vérification
      pour le 422 d'assigné de tâche (AC18).
- [ ] AC21 — **sécurité, prouvé par ablation** : un agent X retiré de A avec `leave_unassigned=true`,
      qui garde une visite planifiée `agent_id = X` sur un bien de A, ne la reçoit plus dans
      `GET /api/calendar` (il la reçoit aujourd'hui) ; rouge si l'on rétablit la clause `agent_id = moi`
      sans condition d'agence.
- [ ] AC22 — **sécurité** (cible de la réattribution unitaire) : `PUT /api/properties/{p}/assigned-agent`
      avec l'`user_id` d'un bailleur de A → 422 `messages.target_user_not_in_active_agency` (200
      aujourd'hui : `$target->agency_id === $agencyId`, l.248, laisse passer le bailleur) ; vers un
      agent d'une autre agence → 422. (Règle de 587, appelée ici — l'AC5b de 587 la porte aussi.)
- [ ] AC23 — retrait : `DELETE /api/agencies/{a}/members/{u}` sur un admin d'agence **sans**
      `AgentProfile` (ni `primary_admin_id`, ni dernier admin) → 200 et son `AgencyAdminProfile` est
      supprimé (422 `user_not_in_agency` aujourd'hui) ; sur un bailleur seul → 422 `member_not_staff`.
      Front (vitest) : la ligne d'un bailleur seul ne propose pas « Retirer de l'agence ».
- [ ] AC24 — front (vitest) : la requête d'activité qui échoue (403 ou 500) affiche un état d'erreur
      avec « Réessayer », **pas** le message « aucune activité » (aujourd'hui l'erreur est avalée en
      liste vide, `CustomerDetailSheet.tsx:58-60`).
- [ ] AC25 — front (vitest) : `stage_counts.lead = 73` et 50 cartes chargées → l'onglet et la colonne
      affichent **73** (50 aujourd'hui) ; « Charger plus » demande `page=2` et affiche la 51ᵉ carte.
- [ ] AC26 — front (vitest) : « Tâches du jour » du tableau de bord agent pointe sur
      `/app/tasks?filter[due]=today` (aujourd'hui `/app/overview/agent`, la page elle-même).
- [ ] AC27 — front (vitest) : un prestataire atteint `/app/calendar` sans redirection (aujourd'hui
      redirigé vers `/app`) et la page ne demande que `types[]=maintenance` ; côté API,
      `GET /api/calendar?types[]=booking&types[]=visit` par ce prestataire rend une liste vide.
- [ ] AC28 — front (vitest) : un lot de 5 où l'API rend `updated = 3` et 2 refus (`unchanged`,
      `invalid_target`) affiche « 3 … 2 refusés » avec les deux motifs, laisse **exactement** les 2 refus
      sélectionnés et rafraîchit la liste (aujourd'hui : premier message seul, sélection entière, pas
      de rafraîchissement).
- [ ] AC29 — **intégrité, prouvé par ablation** (`PropertyReassignmentKeepsOwnerTest`, consolidation) :
      bien P de A, `user_id` = bailleur B, agent X collaborateur `agent` principal. `PUT
      /api/properties/{P}/assigned-agent` vers l'agent Y de A → 200 ; **`properties.user_id` = B
      inchangé** (Y aujourd'hui) ; `PrimaryPropertyContact::for(P)` = Y (X aujourd'hui, l'appel
      n'ayant touché aucun collaborateur) ; X reste collaborateur ; `GET /api/dashboard/owner` par B
      (`DashboardOwnerService.php:25`) compte toujours P ; **`POST /api/leases` sur P par Y rend
      un bail dont `landlord_id` = B** (Y aujourd'hui, `LeaseService.php:32`). Même jeu par
      `bulk-assign` sur P et sur un bien Q saisi par l'agent X (`user_id` = X) : `user_id` de P = B et
      de Q = X, inchangés, responsable = Y sur les deux. Ablation : rétablir
      `$property->update(['user_id' => $target->id])` dans `assignAgent` → rouge (`user_id` et
      `landlord_id` = Y).
- [ ] AC30 — réparation (`RepairReassignedOwnersCommandTest`) : jeu où P (`user_id` B) a été
      réattribué à X puis à Y comme le faisait l'ancien `assignAgent` — deux
      `$property->update(['user_id' => …])` dans le test, qui écrivent la même signature
      `activity_log` (`Property`, `updated`, `old.user_id` ≠ `attributes.user_id`) ; `user_id` final
      Y —, avec un bail `draft` et un bail
      `active` créés ensuite (`landlord_id` = Y). `properties:repair-reassigned-owners --dry-run` :
      rien n'est écrit, la sortie annonce `restored = 1`, `leases_fixed = 1`, `leases_to_review = 1`.
      Sans `--dry-run` : `user_id` = B, responsable = Y, bail `draft` → `landlord_id` = B, bail
      `active` inchangé et listé par identifiant. Second passage : `restored = 0` (idempotente). Un
      bien dont `user_id` n'a jamais changé n'est pas touché.

## Hors périmètre

- Les règles des policies `Customer` (`view`, `delete`) et `Property` (`update`, `delete`, `publish`) :
  TCK-587 (Delta §1 et §4) — ce ticket en est consommateur (`scopeVisibleTo`, `bulk-*`, `attachTo`).
- L'ouverture des lectures aux collaborateurs `co_owner`/`viewer` (branche collaborateur du
  calendrier comprise) : dette D-66, différée par décision du porteur.
- Écrans de visites et de leads, création de visite, routage des leads : TCK-590 (il consomme le
  détecteur de doublons, le geste de contact et le résolveur d'absence).
- La vue terrain « Mes interventions » du prestataire et la règle d'éligibilité des assignations :
  TCK-592. La spec du calendrier prestataire : TCK-446.
- Commissions et compteurs du tableau de bord agent : TCK-595. Choix de l'agent principal : TCK-504.
- Publication en lot ; campagnes e-mail/SMS ciblées (§1.6 P3) ; mode hors ligne (supprimé, A18).
- Envoi automatique au prospect sans compte (alertes de recherche : TCK-599).

## Notes d'implémentation

_(à remplir par implementing-specs)_

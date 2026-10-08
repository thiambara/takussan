---
id: TCK-591
title: "Le CRM de l'agent ne tient pas au téléphone : numéro libre, pipeline sans geste mobile, tâches sans page, fiche éclatée, agenda partiel et ouvert au bailleur, actions en masse muettes, portefeuille orphelin au départ d'un agent"
status: done
phase: P1
family: full
estimate: XL
wave: 73
created: 2026-10-06
updated: 2026-10-08
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
- [x] ADR à écrire et accepter **avant le code** : *« Comment un agenda sort-il de la plateforme ? »*
      — lien secret par utilisateur (table `calendar_feeds` : `user_id`, `agency_id`, `token_hash`,
      `revoked_at`, `last_accessed_at` ; option retenue par défaut) contre jeton Sanctum à portée
      restreinte ;
      contenu des événements ; durée de vie ; révocation au retrait de l'agent.
- [x] ADR à écrire et accepter **avant le code** : *« Comment dit-on qu'un agent est absent, et qui
      reprend ? »* — option retenue par défaut : étendre `role_delegations` d'une colonne `replaces_user_id`
      (FK `role_delegations_replaces_user_fk`, nullable) et réutiliser activation / expiration /
      évènements ; alternative : table `agent_absences`. Trancher aussi les effets (routage des
      nouvelles assignations, vue des tâches).
- [x] ADR à écrire et accepter **avant le code de §7 et des catégories de biens de §8** :
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
- [x] `App\Services\Crm\CustomerPhoneNormalizer` (s'appuie sur `PhoneNumber`, `+221` par défaut),
      appelé par des mutateurs de `Customer` sur `phone` et `emergency_contact_phone` — tout chemin
      d'écriture normalise (formulaire, `CustomerService::findOrCreateFromUser`, conversion de lead
      de 590) ; `TelephoneJoignable` sur ces deux champs dans `Store/UpdateCustomerRequest`.
- [x] `App\Services\Crm\CustomerDuplicateDetector` (même agence, téléphone normalisé ou e-mail replié)
      → 409 `customer_duplicate` ; champ `allow_duplicate` (bool) dans les deux FormRequests.
- [x] Commande `crm:normalize-customer-phones {--dry-run}` : compte normalisés / non normalisables.
- [x] Front : saisie de téléphone du profil (TCK-574) dans le formulaire client ; gestes « Appeler » et
      « WhatsApp » sur la fiche, la carte de pipeline et la tâche ; doublon présenté comme une aide.

**2. Pipeline (A10)**
- [x] Front : changement d'étape sans glisser (carte et fiche), capteur clavier et annonces
      accessibles, pagination « charger plus » (la `meta` de pagination n'est plus jetée), compteurs
      d'onglet et de colonne tirés de `stage_counts`.

**3. Tâches (A11)**
- [x] `Task` : filtre `due` (`AllowedFilter::callback`, fuseau `Africa/Dakar`) ; `TaskController::format`
      ajoute `taskable {type, id, label}`.
- [x] `TaskController::authorizeAssignee` : assigné = soi, ou **personnel** de l'agence du
      `taskable` (`isOwnerAt` retiré) ; erreur 422 par clé `__('errors.tasks.assignee_not_staff')`,
      code `task_assignee_not_staff`. **Rejoué dans `update`** dès que `assigned_to_id` change.
- [x] `TaskPolicy::delete` (créateur ou super-admin) ; `TaskController::destroy` →
      `authorize('delete', $task)`. L'assigné garde `update` (cocher, commenter).
- [x] `TaskPolicy::attachTo` délègue à la policy du parent : `can('view', $customer)` (règle de
      587) / `can('update', $property)` — plus de lecture de `$user->agency_id`. Le `taskable.label`
      n'est rendu qu'à qui passe ce même contrôle.
- [x] Front : page « Mes tâches » (filtres, cocher, créer une tâche sur un client ou un bien) ; lien
      « Tâches du jour » du tableau de bord agent vers elle (`/app/tasks?filter[due]=today`).

**4. Fiche client unique (A12)**
- [x] `CustomerController::activity` + route `customers.activity` (journal du client, de ses notes et
      de ses tâches, mêmes champs exclus que l'`Auditable` de `Customer`) ; relation `Customer::visits()`.
- [x] `Auditable` sur `CustomerNote` et `Task` (sans `body`/`description` dans les propriétés
      journalisées : le journal dit « note ajoutée », pas son contenu).
- [x] Migration `add_kind_to_customer_notes_table` (cf. Contrat) ; `update` et `updatePipelineStage`
      écrivent `kind` + le motif seul ; plus de `'Conversion : '` / `'Perte : '` dans le code.
- [x] Front : une seule fiche (aperçu, notes, tâches, activité, visites, réservations, baux,
      documents, relations) ; le tiroir en est la vue réduite ; plus d'appel à `/api/audit-log` ;
      une erreur de chargement de l'activité est montrée (et relançable), jamais rendue en liste
      vide ; le préfixe des notes `conversion`/`loss` est traduit à l'affichage.

**5. Critères et rapprochement (A13)**
- [x] Migration `add_search_criteria_to_customers_table` (cf. Contrat) ; `$fillable`, casts,
      `$queryFields`, règles dans les deux FormRequests (`budget_min ≤ budget_max`).
- [x] `App\Services\Crm\ProspectMatcher` — SQL sur les biens de l'agence (`addresses` pour ville et
      quartier), prospects `active` hors `converted`/`lost` ; `Crm\ProspectMatchController`.
- [x] Job `SendProspectMatchDigest` (quotidien, planifié) : biens publiés ou dont le prix a changé
      (`PropertyPriceHistory`) depuis 24 h → une notification par référent (sinon `added_by`), par
      clé `__()`, jamais vide.
- [x] Front : critères sur la fiche ; « N prospects correspondent » sur la fiche bien ; partage
      WhatsApp de la sélection.

**6. Calendrier (A16, P17)**
- [x] `IndexCalendarRequest` : `types.*` `in:booking,visit,task,lease_event,maintenance`, `mine`
      (bool), fenêtre ≤ 186 jours.
- [x] `CalendarController` : périmètre réécrit sur le prédicat « personnel de l'agence » (bailleur :
      ses biens seulement) ; la branche `agent_id = moi` (l.128) n'est retenue **que** pour un bien
      d'une agence où l'appelant est personnel ; branche collaborateur inchangée (D-66) ; refus
      l.51 par clé `__('errors.calendar.cross_agency_forbidden')` ; `task` (personnelles, `due_at`), `lease_event` (`end_date`,
      `renewal_date`), `maintenance` (`scheduled_at` ; personnel : biens de l'agence ; prestataire :
      `assigned_to = moi`) ; `mine=1` = `agent_id`/`assigned_to_id`/`assigned_to` = moi.
- [x] `CalendarFeedController` + `IcsCalendarRenderer` selon l'ADR ; révocation des flux au retrait.
- [x] Front : types, légende et filtre « Mes rendez-vous » ; abonnement ; la page s'ouvre au
      prestataire (option retenue par défaut, cf. Contraintes 9 / 446) et ne lui demande que le type
      `maintenance` — le raccourci de `DashboardShortcuts.tsx:78` cesse de mener à une redirection.

**7. Actions en masse (A17)**
- [x] `PropertyBulkVisibilityRequest` ; `PropertyBulkVisibilityService` sur le modèle de
      `PropertyBulkArchiveService` ; route déclarée avant `{property}` (`routes/api/properties.php:19`).
- [ ] `PropertyBulkAssignRequest`, `PropertyBulkAssignService`, route `bulk-assign` → transféré à TCK-603
- [ ] `PropertyController::assignAgent` (corps, l.238-259) : **supprimer**
      `$property->update(['user_id' => $target->id])` (l.254) ; à la place, désigner la cible
      **agent responsable** selon l'ADR « agent responsable » (Delta 0 ; option retenue par défaut :
      la cible devient le collaborateur `agent` marqué principal par le service de TCK-504 — ligne
      `property_collaborators` créée si absente, `role = agent`, `invited_at = now()` ; une ligne
      existante d'un autre rôle : traitement tranché par l'ADR, 504 n'admettant que `agent` en
      principal ; l'ancien principal reste collaborateur, sans la marque, `commission_share`
      intact). Le tout sous
      `DB::transaction`, ligne parent verrouillée (`Property::whereKey()->lockForUpdate()`, piège
      PostgreSQL n°2). La réponse charge `owner` et `PrimaryPropertyContact::eagerLoads()`. → transféré à TCK-603
- [ ] Règle de cible : celle de **TCK-587** (Contraintes 9), appelée par `assignAgent` **et** par
      `PropertyBulkAssignService` — 591 ne la réécrit pas ; en lot, son refus devient
      `invalid_target`. Le contrôle maison l.247-251 (`$target->agency_id === $agencyId`) disparaît. → transféré à TCK-603
- [ ] `PropertyBulkAssignService` : même désignation que l'unitaire (un seul service
      `App\Services\Property\ResponsibleAgentAssigner::assign(Property, User $target, User $actor)`
      appelé par les deux), **jamais** d'écriture de `user_id` ; cible déjà responsable →
      `unchanged`. Journal : `activity('Property')`, évènement `responsible_agent_changed`
      (`property_id`, ancien et nouveau responsable) — la trace qui manquait au geste. → transféré à TCK-603
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
      par le seed (`hebergement.md:213`) la rend sans objet. En local, `migrate:fresh --seed` suffit. → transféré à TCK-603
- [ ] Front : les trois actions passent par `bulk-*` ; bilan chiffré et motivé (`invalid_target`
      dit que la cible n'est pas du personnel actif de l'agence) ; seuls les refus restent
      sélectionnés ; la liste est rafraîchie dès qu'au moins un bien a changé, succès partiel
      compris. Le geste s'intitule « Changer l'agent responsable » ; la liste et la fiche distinguent
      propriétaire et agent responsable (`owner` / `primary_contact`). → transféré à TCK-603

**8. Passation et absence (AD14)**
- [x] `App\Services\Agency\AgentHandoverService` (`inventory()`, `transfer()`) ; `AgentHandoverController`
      + `StoreAgentHandoverRequest` (repreneur unique ou par catégorie, `leave_unassigned`,
      `remove_after`) ; autorisation par `team.remove` — tâches, visites, interventions,
      collaborations, clients ; `held_properties` compté (inventaire, garde du retrait).
- [ ] Catégories de biens de la passation (Contraintes 3) :
      `responsible_properties` → `ResponsibleAgentAssigner` vers le repreneur (jamais `user_id`) ;
      `held_properties` (`user_id` = le partant) → `user_id` ← repreneur du personnel de la même
      agence, selon la question 2 de l'ADR « agent responsable ». Un bien dont `user_id` est un
      bailleur n'entre dans aucune des deux catégories par son `user_id`.
      *`held_properties` est compté mais pas transmis ; `responsible_properties` attend la marque
      de principal de TCK-504.* → transféré à TCK-603
- [x] `App\Services\Agency\AgencyMemberRemovalService::remove(Agency, User $member, User $actor, bool
      $leaveUnassigned)` — **seul** chemin de retrait : `AgencyController::removeAgent` et
      `AgentInvitationService::remove` y délèguent. Il garde les deux gardes actuelles
      (`primary_admin_id`, dernier admin sous verrou, `AgencyController.php:230-260`), accepte un
      membre portant un `AgentProfile` **ou** un `AgencyAdminProfile` dans l'agence (bailleur seul →
      422 `member_not_staff`), refuse un portefeuille non vide sans passation ni `leave_unassigned`
      (422 `portfolio_not_empty`), journalise `agent_removed` / `agency_admin_removed`
      (`activity('Membership')`, propriétés `agency_id`, profils supprimés, `leave_unassigned`) et
      révoque les flux iCalendar du membre dans l'agence.
- [x] Autorisation du retrait par la capacité `team.remove` dans l'agence de la route (au lieu de
      `can('update', $agency)`, `AgencyController.php:274-277`) — lecteur de la capacité.
- [x] Front : « Retirer de l'agence » n'est proposé que sur un membre du personnel (agent, admin
      d'agence), jamais sur un bailleur seul.
- [x] `SetPrimaryContactCustomerRequest` : `user_id` = personnel de l'agence du client ; capacité
      `crm.assign` ; front : désigner le référent depuis la fiche.
- [x] Absence selon l'ADR (migration, service, résolveur `AgentAvailability::substituteFor()`),
      `TaskPolicy::view` étendu au remplaçant pendant la période.
- [x] Front : assistant de passation déclenché par « Retirer » ; « Déclarer une absence ».

**9. Cloisonnement du CRM (passe de correction)**
- [x] `Customer::scopeVisibleTo(User)` (règle de `CustomerPolicy::view` réécrite par 587 : super-admin
      → tout ; personnel de l'agence titulaire de `crm.view_all` → l'agence ; sinon → `added_by_id =
      moi`) ; `CustomerController::index` et `PipelineStatsService::scopedQuery` l'emploient — plus de
      `$user->agency_id` dans ces deux fichiers.
- [x] `CustomerPolicy::create` (personnel de l'agence du profil actif, ou super-admin — bloc neuf,
      cf. Contraintes 9) ; `StoreCustomerRequest::authorize` → `can('create', Customer::class)` ;
      `store` écrit `agency_id` = l'agence où l'appelant est personnel.
- [x] Front : ni « Ajouter un client » ni lien vers le pipeline pour un compte qui n'est pas du
      personnel ; ses fiches existantes restent lisibles.

**10. Tests**
- [x] `CustomerScopeTest`, `TaskAuthorizationTest`, `CustomerNoteKindTest`,
      `AgencyMemberRemovalTest`, `CustomerPhoneAndDuplicateTest`, `CustomerActivityEndpointTest`, `PrimaryContactScopeTest`,
      `ProspectMatcherTest`, `SendProspectMatchDigestTest`, `TaskDueFilterTest`,
      `CalendarScopeTest`, `CalendarNewTypesTest`, `CalendarFeedTest`, `PropertyBulkVisibilityTest`,
      `AgentHandoverTest`, `AgentRemovalJournalTest`, `AgentAbsenceTest` ; vitest des écrans touchés.
- [ ] `PropertyAssignAgentTest`, `PropertyBulkAssignTest`, `PropertyReassignmentKeepsOwnerTest`,
      `RepairReassignedOwnersCommandTest` → transféré à TCK-603

**11. Ajoutés après vérification adverse (verif-591, 2026-10-07 — B1, M1 à M5, m1 à m3)**
- [x] B1 — la branche « assigné » est bornée par l'agence du parent ET le statut de personnel
      (`isStaffAt`) : `TaskPolicy::view`/`update`, `TaskController::index`,
      `CalendarEventCollector::tasks()` et la branche `assigned_to` de `maintenance()`.
      `CalendarFeedService::issue()` refuse un lien sans agence hors prestataire (403
      `calendar.feed_not_staff`), `resolve()` ne le sert pas (ADR-0034 §2).
- [x] M1 — la clause « auteur » exige l'appartenance (profil actif de tout type dans l'agence de la
      fiche ou du parent ; une fiche sans agence garde son auteur) : `CustomerPolicy::view`,
      `Customer::scopeVisibleTo`, `TaskPolicy::view`/`delete`, branche « créées » de
      `TaskController::index` et du collecteur. `authorizeAssignee` ne court-circuite « soi-même »
      que sur un parent hors agence. **Cette décision de la session modifie la règle de TCK-587**
      (`CustomerPolicy::view`, `Customer::scopeVisibleTo` : « sinon → `added_by_id` = moi » devient
      « sinon → `added_by_id` = moi ET membre de l'agence de la fiche, ou fiche sans agence »).
- [x] M2 — passation et `GET …/portfolio` réservées à un membre de l'équipe (profil agent ou admin
      d'agence dans l'agence, 422 `agent_handover.member_not_staff`) ; `collaborations` bornées à
      `role = agent`.
- [x] M3 — `App\Services\Property\PropertyPublication` : `unpublish` et `bulk-visibility` écrivent
      `draft`/`private`/`published_at = null` et refusent hors `available | published` (motif de lot
      `invalid_status`) ; l'archivage en lot écrit ce qu'écrit l'archivage unitaire (`published_at =
      null`), droits inchangés (précision de la session). `PipelineStatsService` hors périmètre.
- [x] M4 — `resolve()` ne sert pas le flux d'un compte non actif ; `UserAdminController::block`
      révoque les liens d'agenda.
- [x] M5 — `AgentAvailability` (`substituteFor`, `covers`, `coveredBy`) exige un remplaçant
      personnel actif ; `substituteFor` retombe sur l'absent sinon.
- [x] m1 — la détection de doublon ne sonde que pour le personnel de l'agence de la fiche.
- [x] m2 — les critères de recherche (`budget_*`, `seeking_*`, `min_bedrooms`) ne sont rendus qu'au
      personnel de l'agence (au super-admin, à l'auteur d'une fiche sans agence), y compris par
      `include=tenant` / `include=customer`.
- [x] m3 — `reason` d'une absence rendu à l'absent, à l'auteur et au titulaire de
      `team.delegate_role` seulement.

## Critères d'acceptation

- [x] AC1 — `POST /api/customers` avec `phone="77 123 45 67"` enregistre `+221771234567` ;
      `phone="+330612345678"` rend 422 ; un second client de la même agence avec `"+221 77 123 45 67"`
      rend **409** `customer_duplicate` dont `existing[0].id` est le premier ; même appel avec
      `allow_duplicate=true` → 201 ; dans une **autre** agence → 201. Idem pour `AWA@x.sn` contre
      `awa@x.sn`.
- [x] AC2 — **sécurité, prouvé par ablation** : un utilisateur dont le seul profil dans l'agence A est
      `OwnerProfile` reçoit, sur `GET /api/calendar`, les événements de **ses** biens et **aucun**
      d'un bien de A dont il n'est pas propriétaire ; le test rougit sur le code actuel et redevient
      rouge si l'on remet `$user->agency_id` dans le périmètre.
- [x] AC3 — **sécurité, prouvé par ablation** : `POST customers/{c}/primary-contact` avec l'`user_id`
      d'un agent d'une autre agence, ou d'un bailleur de la même agence, rend 422 ; sans `crm.assign`,
      403. Rouge sur le code actuel.
- [ ] AC4 — **sécurité, prouvé par ablation** : `bulk-assign` vers un bailleur de l'agence rend ce bien
      en `failed` avec `invalid_target`, ne modifie ni `user_id` ni l'agent responsable ; vers un agent
      **suspendu** de l'agence, idem. Le refus vient de la règle de cible de **TCK-587** (Delta §3,
      AC5b), que `PropertyBulkAssignService` appelle (Contraintes 9) : on remplace l'appel par
      `true` → le bien passe en `updated`, rouge. → transféré à TCK-603
- [x] AC5 — sur 5 biens dont 1 d'une autre agence et 1 déjà privé, `bulk-visibility` rend
      `updated = 3`, `failed` = `[{forbidden}, {unchanged}]` + l'identifiant inconnu en `not_found` ;
      une exception levée au 2ᵉ bien autorisé laisse les 3 inchangés (transaction).
- [x] AC6 — `GET /api/customers/{c}/activity` rend **200** à un agent de l'agence avec **exactement**
      trois entrées pour le jeu du test (le changement d'étape du client, la note ajoutée, la tâche
      créée — les deux dernières exigent `Auditable` sur `CustomerNote` et `Task` ; on retire le
      trait → 2 entrées, rouge) ; aucune entrée ne contient le `body` de la note ; **403** à un agent
      d'une autre agence.
- [x] AC7 — `GET /api/tasks?filter[due]=overdue` sur un jeu fixé (une tâche hier ouverte, une hier
      terminée, une aujourd'hui, une demain) rend **exactement** la première ; `today` → la
      troisième ; chaque ligne porte `taskable.label`.
- [x] AC8 — `GET /api/calendar?types[]=task&types[]=lease_event&types[]=maintenance&mine=1` rend,
      pour l'agent, ses tâches, la fin et le renouvellement des baux de l'agence dans la fenêtre, et
      les interventions planifiées des biens de l'agence ; une fenêtre de 200 jours → 422.
- [x] AC9 — un prestataire assigné à une intervention planifiée la reçoit en type `maintenance`, et
      aucune autre intervention de l'agence.
- [x] AC10 — le flux `.ics` est un VCALENDAR valide, ne contient ni nom ni téléphone de visiteur ;
      après révocation, ou après retrait de l'agent, il rend 404 ; le jeton n'est pas stocké en clair.
- [x] AC11 — un prospect `{contract_type: rent, budget_max: 300000, cities: [Dakar], min_bedrooms: 2}`
      correspond à un bien de l'agence à 250 000 / Dakar / 3 chambres, privé compris, et à **aucun**
      bien d'une autre agence ni à 350 000 ; le récapitulatif quotidien notifie son référent une
      fois, et personne quand rien ne correspond.
- [x] AC12 — passation d'un agent portant 3 tâches, 2 visites à venir, 1 intervention, 2
      collaborations (dont une où le repreneur collabore déjà) et 2 clients référents : après
      `POST …/handover`, tout est au repreneur, la collaboration en double n'existe qu'une fois,
      `activity_log` porte une entrée par catégorie ; une erreur injectée à mi-parcours ne déplace
      rien (`AgentHandoverTest`).
- [ ] AC12, part « biens » — 1 bien dont il est agent responsable et dont `user_id` est un
      **bailleur** B, 1 bien qu'il a saisi (`user_id` = lui) : agent responsable du bien de B
      (`PrimaryPropertyContact::for` = repreneur) **avec `user_id` toujours = B**, `user_id` du bien
      saisi = repreneur → transféré à TCK-603 (AC5)
- [x] AC13 — `DELETE /api/agencies/{a}/members/{u}` sur un agent au portefeuille non vide, sans
      passation ni `leave_unassigned`, rend 422 `portfolio_not_empty` ; avec, il journalise
      `agent_removed` (rouge sur le code actuel, qui ne journalise pas). Un agent tenant un rôle
      personnalisé **avec** `team.remove` retire un collègue (200 ; 403 aujourd'hui) ; un admin dont
      le rôle **retire** `team.remove` reçoit 403 (200 aujourd'hui). `primary_admin_id` et dernier
      admin : 422 inchangés. Après retrait, le flux iCalendar du retiré rend 404.
- [x] AC14 — pendant une absence active de X remplacé par Y, Y voit les tâches de X et le résolveur
      rend Y ; après la date de fin, plus rien ; aucune ligne existante n'a changé.
- [x] AC15 — front : depuis un écran de 360 px, au clavier, l'agent change l'étape d'un client ; au
      clavier comme au doigt, il coche une tâche ; au doigt, il ouvre WhatsApp sur le bon numéro avec
      le message prérempli ; la console ne contient plus d'appel à `/api/audit-log` depuis la fiche
      client (mesuré au navigateur, cf. Notes).
- [ ] AC15, part « au doigt dans le `<select>` natif » — changer l'étape au doigt, mesuré sur un
      vrai téléphone → transféré à TCK-603 (AC6)
- [x] AC16 — **sécurité, prouvé par ablation** (CRM) : agence A avec 3 clients ajoutés par un agent
      et 1 ajouté par un bailleur B de A (seul profil `OwnerProfile`). `GET /api/customers` par B rend
      **exactement** l'identifiant de sa fiche (4 aujourd'hui) ; `GET /api/customers/pipeline-stats`
      par B rend `stage_counts` de somme **1** ; un agent de A du rôle système (`crm.view_all`) en
      voit 4 ; un second agent de A, d'un rôle personnalisé sans `crm.view_all` et qui n'a rien
      ajouté, en voit **0**. Chaque ligne rendue passe `CustomerPolicy::view`.
      Rouge si l'on remet `$user->agency_id` dans `index` ou dans `PipelineStatsService`.
- [x] AC17 — **sécurité** : `POST /api/customers` par un compte sans profil → **403** ; par un
      bailleur de A → **403** (201 aujourd'hui dans les deux cas) ; par un agent de A → 201 avec
      `agency_id = A`.
- [x] AC18 — **sécurité, prouvé par ablation** (tâches) : `POST /api/tasks` avec `assigned_to_id`
      d'un bailleur de A → 422 `task_assignee_not_staff` (201 aujourd'hui) ; `PUT /api/tasks/{t}` avec
      l'`assigned_to_id` d'un agent d'une **autre** agence → 422 (200 aujourd'hui) ; `DELETE` par
      l'assigné non créateur → **403** (204 aujourd'hui), par le créateur → 204 ; `POST /api/tasks`
      par un bailleur de A sur un client de A qu'il n'a pas ajouté → **403** (201 aujourd'hui) et la
      réponse ne contient pas son nom.
- [x] AC19 — `PATCH /api/customers/{c}/pipeline-stage` vers `lost` avec `reason = "Budget"` crée une
      note épinglée `kind = loss`, `body = "Budget"` (aujourd'hui `"Perte : Budget"`) ; idem par
      `PUT /api/customers/{c}` vers `converted` (`kind = conversion`). La migration convertit une note
      existante `"Perte : X"` en `kind = loss`, `body = "X"`, et son `down()` la restaure à
      l'identique. Front (vitest) : en `en`, la note s'affiche « Lost: Budget » ; en `fr`,
      « Perte : Budget ». `grep -n "'Perte : '\|'Conversion : '" takussan-api/app` → vide.
- [x] AC20 — refus traduits : `GET /api/calendar?agency_id=…` par un non-super-admin rend 403 dont le
      `message` vaut `__('errors.calendar.cross_agency_forbidden')` dans la locale demandée — **deux
      chaînes différentes** en `fr` et `en` (aujourd'hui la même chaîne anglaise) ; même vérification
      pour le 422 d'assigné de tâche (AC18).
- [x] AC21 — **sécurité, prouvé par ablation** : un agent X retiré de A avec `leave_unassigned=true`,
      qui garde une visite planifiée `agent_id = X` sur un bien de A, ne la reçoit plus dans
      `GET /api/calendar` (il la reçoit aujourd'hui) ; rouge si l'on rétablit la clause `agent_id = moi`
      sans condition d'agence.
- [ ] AC22 — **sécurité** (cible de la réattribution unitaire) : `PUT /api/properties/{p}/assigned-agent`
      avec l'`user_id` d'un bailleur de A → 422 `messages.target_user_not_in_active_agency` (200
      aujourd'hui : `$target->agency_id === $agencyId`, l.248, laisse passer le bailleur) ; vers un
      agent d'une autre agence → 422. (Règle de 587, appelée ici — l'AC5b de 587 la porte aussi.) → transféré à TCK-603
- [x] AC23 — retrait : `DELETE /api/agencies/{a}/members/{u}` sur un admin d'agence **sans**
      `AgentProfile` (ni `primary_admin_id`, ni dernier admin) → 200 et son `AgencyAdminProfile` est
      supprimé (422 `user_not_in_agency` aujourd'hui) ; sur un bailleur seul → 422 `member_not_staff`.
      Front (vitest) : la ligne d'un bailleur seul ne propose pas « Retirer de l'agence ».
- [x] AC24 — front (vitest) : la requête d'activité qui échoue (403 ou 500) affiche un état d'erreur
      avec « Réessayer », **pas** le message « aucune activité » (aujourd'hui l'erreur est avalée en
      liste vide, `CustomerDetailSheet.tsx:58-60`).
- [x] AC25 — front (vitest) : `stage_counts.lead = 73` et 50 cartes chargées → l'onglet et la colonne
      affichent **73** (50 aujourd'hui) ; « Charger plus » demande `page=2` et affiche la 51ᵉ carte.
- [x] AC26 — front (vitest) : « Tâches du jour » du tableau de bord agent pointe sur
      `/app/tasks?filter[due]=today` (aujourd'hui `/app/overview/agent`, la page elle-même).
- [x] AC27 — front (vitest) : un prestataire atteint `/app/calendar` sans redirection (aujourd'hui
      redirigé vers `/app`) et la page ne demande que `types[]=maintenance` ; côté API,
      `GET /api/calendar?types[]=booking&types[]=visit` par ce prestataire rend une liste vide.
- [x] AC28 — front (vitest) : un lot de 5 où l'API rend `updated = 3` et 2 refus (`unchanged`,
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
      `landlord_id` = Y). → transféré à TCK-603
- [ ] AC30 — réparation (`RepairReassignedOwnersCommandTest`) : jeu où P (`user_id` B) a été
      réattribué à X puis à Y comme le faisait l'ancien `assignAgent` — deux
      `$property->update(['user_id' => …])` dans le test, qui écrivent la même signature
      `activity_log` (`Property`, `updated`, `old.user_id` ≠ `attributes.user_id`) ; `user_id` final
      Y —, avec un bail `draft` et un bail
      `active` créés ensuite (`landlord_id` = Y). `properties:repair-reassigned-owners --dry-run` :
      rien n'est écrit, la sortie annonce `restored = 1`, `leases_fixed = 1`, `leases_to_review = 1`.
      Sans `--dry-run` : `user_id` = B, responsable = Y, bail `draft` → `landlord_id` = B, bail
      `active` inchangé et listé par identifiant. Second passage : `restored = 0` (idempotente). Un
      bien dont `user_id` n'a jamais changé n'est pas touché. → transféré à TCK-603

**Ajoutés après vérification adverse** (verif-591, 2026-10-07). Chaque test est rouge sur `b3840d0b`,
chaque ablation est rejouée et restaurée par `cp`, et chaque sonde du vérificateur (qui assertait le
défaut) rougit après correctif.

- [x] AC31 (B1) — un agent retiré avec `leave_unassigned` ne lit plus ni ses tâches, ni ses
      interventions, ni son flux, et ne peut pas en créer un neuf ; seul un prestataire reçoit un
      flux sans agence. Preuve : `AgencyMemberRemovalTest::test_an_agent_removed_with_leave_unassigned_loses_his_tasks_interventions_and_feed`,
      `::test_only_a_provider_is_served_an_agencyless_feed` (`9e27ceee`). Ablations → rouge : garde de
      `TaskPolicy` (assigné), `TaskController::index`, `CalendarEventCollector::tasks()`, branche
      `assigned_to` de `maintenance()`, garde hors agence de `resolve()`. Sonde P1 → rouge.
- [x] AC32 (M1) — après passation et retrait, le partant ne garde ni ses fiches ni ses tâches
      créées ; un bailleur actif garde ses propres ajouts, un bailleur bloqué non ; s'assigner une
      tâche d'agence exige d'être du personnel. Preuve :
      `AgentHandoverTest::test_after_handover_and_removal_the_leaver_keeps_nothing_he_authored`,
      `CustomerScopeTest::test_an_active_landlord_keeps_his_own_adds_a_blocked_one_does_not`,
      `TaskAuthorizationTest::test_assigning_oneself_on_an_agency_parent_requires_being_staff`
      (`bdddd1d0`, `b79005bb`). Ablations → rouge : appartenance dans `CustomerPolicy::view`, dans
      `scopeVisibleTo`, dans `TaskPolicy::delete`, court-circuit « soi-même ». Sonde P2 → rouge.
      `MigratedAuthorizationRulesTest` : deux tests de TCK-306 alignés sur la règle nouvelle.
- [x] AC33 (M2) — la passation d'un bailleur rend 422 `agent_handover.member_not_staff` (lecture et
      écriture), et seules les collaborations `agent` sont transmises. Preuve :
      `AgentHandoverTest::test_only_a_team_member_is_handed_over_and_only_his_agent_collaborations`
      (`a49eba65`). Ablations → rouge : garde du cédant, filtre `role = agent`. Sonde P3 → rouge.
- [x] AC34 (M3) — AC5 étendu : « Dépublier » en lot écrit `status = draft`, `visibility = private`,
      `published_at = null` comme l'unitaire, et compte un bien hors `available | published` en
      `invalid_status` ; l'archivage en lot écrit l'état de l'archivage unitaire. Preuve :
      `PropertyBulkVisibilityTest::test_bulk_unpublish_is_the_unitary_unpublish` (+ AC5 étendu),
      `PropertyBulkArchiveTest::test_bulk_archive_writes_what_the_unitary_archive_writes`, vitest
      `invalid_status` (`b26f6af9`). Ablations → rouge : écriture du lot réduite à `visibility`, garde
      de statut, écriture d'archive d'avant. Sonde P4 → rouge.
- [x] AC35 (M4) — bloquer un compte coupe son flux (`404`), et le réactiver ne le ressuscite pas.
      Preuve : `CalendarFeedTest::test_blocking_the_account_kills_its_feed` (`43a734a4`). Ablations →
      rouge : révocation dans `block()`, garde de statut dans `resolve()`. Sonde P5 → rouge.
- [x] AC36 (M5) — un remplaçant suspendu ne couvre plus : la tâche reste à l'absent, `covers` et
      `coveredBy` l'ignorent. Preuve : `AgentAbsenceTest::test_a_suspended_substitute_no_longer_covers`
      (`f5ff0535`). Ablations → rouge : `substituteFor`, `covers`, `coveredBy`. Sonde P6 → rouge.
- [x] AC37 (m1) — un bailleur auteur ne reçoit pas de 409 de doublon. Preuve :
      `CustomerPhoneAndDuplicateTest::test_the_duplicate_check_is_no_oracle_for_a_landlord`
      (`230eefb7`). Ablation de la garde → rouge.
- [x] AC38 (m2) — le bailleur ne lit pas les critères de recherche de son locataire (fiche,
      `include=tenant`, `include=customer`). Preuve :
      `CustomerScopeTest::test_search_criteria_are_rendered_to_agency_staff_only` (`c64dbcbb`).
      Ablation → rouge.
- [x] AC39 (m3) — `reason` est absent pour un agent tiers, présent pour l'absent, l'auteur et le
      délégant. Preuve :
      `AgentAbsenceTest::test_the_absence_reason_is_read_only_by_the_absent_the_author_and_the_delegator`
      (`95dbf59b`). Ablation → rouge.

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

### 2026-10-07 — branche `feat/tck-591-crm-agenda-agent-et-passation`, base `5f872f1f`

- **ADR** : 0034 (agenda, lien secret haché), 0035 (absence = délégation `absence_cover` qui n'accorde
  rien), 0036 (agent responsable = principal de TCK-504) — trois commits, avant le code.
- **Clés de langue API** : le brief du lot B impose un fichier de domaine propre plutôt
  qu'`errors.php` (créé en parallèle par 587 et 588). Les clés sont donc `crm.tasks.*`,
  `calendar.errors.*`, `team_handover.*` au lieu des `errors.tasks.*` / `errors.calendar.*` du Delta ;
  588 les déplacera s'il le juge bon.
- **§3 Tâches** (`7398e98c`) — re-mesuré : `TaskController::authorizeAssignee` l.83-87 (`isOwnerAt`),
  `update` l.99-111 sans contrôle, `destroy` par `view` l.115, `TaskPolicy::attachTo` par
  `$user->agency_id` : conformes au Contexte. L'agence jugée pour l'assigné est désormais celle du
  **parent** de la tâche (plus celle du profil actif de l'appelant). Le libellé `taskable.label` n'est
  rendu qu'à qui passe `attachTo`.
  `php artisan test tests/Feature/Crm/TaskAuthorizationTest.php tests/Feature/Crm/TaskDueFilterTest.php
  tests/Feature/Api/TaskTest.php tests/Feature/Crm/TaskReminderTest.php` → 25 verts, 2 sautés.
  **Ablation** (les trois fichiers d'app remis à `5f872f1f`) : 5 rouges sur 6 exécutés (bailleur
  assignable, `PUT` sans contrôle, suppression par l'assigné, libellé absent, 422 non traduit).
  Les 2 sautés (bailleur qui rattache à un client qu'il n'a pas ajouté ; libellé caché à l'assigné
  hors périmètre) attendent la `CustomerPolicy::view` de TCK-587 : saut qui expire seul
  (`method_exists(User::class, 'staffAgencyId')`), retiré à la fusion.
- **§6 Agenda** (`e2f8291f`) — re-mesuré : `CalendarController.php:45` (`$user->agency_id`), `:51`
  (littéral anglais), `:128` (`agent_id = moi` sans condition) conformes au Contexte. Le périmètre vit
  dans `App\Services\Calendar\CalendarEventCollector`, partagé par la console et le flux `.ics`.
  **Lecture de `mine=1`** : le Delta dit « `agent_id`/`assigned_to_id`/`assigned_to` = moi » et AC8
  attend sous `mine=1` les échéances de bail de l'agence : `mine` filtre donc les seuls types qui ont
  une colonne d'affectation (visite, tâche, intervention) ; réservations et échéances de bail n'en ont
  pas et restent au périmètre. Le jeu d'AC8 assigne l'intervention à l'agent.
  Événements : clé stable `key` (`<type>-<id>[-<kind>]`) ajoutée à chaque événement.
  Endpoint ajouté hors tableau du Contrat : `GET /api/me/calendar-feed` (état du lien, sans jeton),
  dont l'écran d'abonnement a besoin.
  `php artisan test tests/Feature/Calendar tests/Feature/Api/CalendarTest.php` → 25 verts.
  **Ablations** (après commit) : `staffAgencyId: $user->agency_id` dans le contrôleur → AC2 rouge
  (le bailleur voit le bien de l'agent) ; branche `agent_id = moi OR périmètre` rétablie dans le
  collecteur → AC21 rouge (l'agent retiré voit encore sa visite).
- **§1, §4 (API), §5 (migration), §8 (référent), §9 (`create`)** (`c66b826c`) — re-mesuré :
  `StoreCustomerRequest.php:37` / `UpdateCustomerRequest.php:44` (`phone` libre),
  `CustomerController.php:100-101` et `:192-193` (préfixes), `IndexAuditLogRequest` réservé aux
  admins, `SetPrimaryContactCustomerRequest.php:36` (`exists:users,id`), `StoreCustomerRequest::authorize`
  → `true` : conformes. **Écart** : spatie/activitylog est en **v5.1** ; les changements de champs
  vivent dans la colonne `activity_log.attribute_changes`, plus dans `properties` (le Contexte 7 et
  le Delta §7 écrivent `properties->'old'->>'user_id'` : la commande de réparation devra lire
  `attribute_changes`). La normalisation passe par `prepareForValidation` (trait
  `ValidatesCustomerContactAndCriteria`) puis `TelephoneJoignable`, et par les mutateurs de
  `Customer` pour tout autre chemin. Le détecteur ne nomme que les fiches que l'appelant peut voir
  (`existing[].id/name` à `null` sinon). Deux tests existants encodaient les défauts et ont été
  réécrits : `CustomerTest::test_agent_creates_customer…` (un compte sans profil créait un client),
  `CustomerCrmTest::test_set_primary_contact*` (référent = compte quelconque).
  `php artisan test tests/Feature/Crm/{CustomerPhoneAndDuplicateTest,CustomerNoteKindTest,CustomerActivityEndpointTest,PrimaryContactScopeTest,CustomerScopeTest}.php`
  → 20 verts ; `tests/Feature/Api/Customer*Test.php`, `CustomerSearchTest`,
  `AuthorizationPrecedesValidationTest`, `PropertyDomainValidationTest` → verts.
  **Ablations** (après commit) : `SetPrimaryContactCustomerRequest` d'origine → AC3 rouge (200 au lieu
  de 422 ; 200 au lieu de 403) ; `StoreCustomerRequest::authorize` → `true` → AC17 rouge (201) ;
  `Auditable` retiré de `CustomerNote` et `Task` → AC6 rouge (1 entrée au lieu de 3).

- **§5 rapprochement** (`02dca62d`) — re-mesuré : aucun service de rapprochement (`grep -ri
  match app/Services` : seuls les recherches sauvegardées et Meilisearch), `PropertySearchService`
  public seul : conforme. `ProspectMatcher` est en SQL dans les deux sens, borné à l'agence ; un
  critère absent ne filtre pas, **un prospect sans aucun critère ne correspond à rien** (il
  correspondrait sinon à tout le portefeuille) ; villes/quartiers repliés par `CaseInsensitive`
  (ADR-0025) ; statuts non proposables = la liste de `Property::scopePublic`, visibilité et
  `published_at` exclus des critères (privé compris). Autorisation par deux abilities de policy
  (`CustomerPolicy::matchProperties`, `PropertyPolicy::matchProspects`) : personnel de l'agence,
  jamais le bailleur. **Écart d'interprétation** : le récapitulatif prend les biens *publiés* **ou
  saisis** depuis 24 h (un bien privé n'a pas toujours de `published_at`) ou repris en prix ; le
  destinataire (référent `is_primary` actif, sinon `added_by`) doit être encore du personnel de
  l'agence ; idempotent par jour (`data.kind` + `data.digest_date`) ; planifié à 08:30.
  `php artisan test tests/Feature/Crm/ProspectMatcherTest.php tests/Feature/Crm/SendProspectMatchDigestTest.php`
  → 8 verts. **Ablations** (après commit) : borne d'agence de `propertiesFor` retirée → AC11 rouge
  (le bien de l'autre agence sort) ; `alreadySent` retiré → rouge (`MultipleRecordsFoundException`,
  deux notifications) ; `matchProspects` → `true` → rouge (le bailleur lit les prospects) ; garde
  « au moins un critère » retirée → rouge (un client sans critère correspond).
- **§8 absence** (`ff28048c`) — re-mesuré : `role_delegations` sans colonne d'absent, `delegator_id`
  = l'auteur ; `delegationsAllow` lit `AgencyRoleBaseType::tryFrom()` et `hasActiveAgencyDelegation`
  filtre par rôle : un rôle `absence_cover` n'accorde rien sans toucher au résolveur. Conforme à
  l'ADR-0035. Ajouts : la ligne d'absence est créée sans événement `RoleDelegationCreated` /
  `Activated` (les trois `NotifyDelegation*` ignorent de toute façon une absence, pour les
  événements que le job d'activation et la révocation émettent) ; chevauchement jugé sous verrou de
  la ligne de l'absent ; la couverture d'une tâche se juge dans l'agence de son `taskable`.
  `php artisan test tests/Feature/Agency/AgentAbsenceTest.php` → 6 verts ; délégations
  (`tests/Unit/Policies/RoleDelegationPolicyTest.php`, `tests/Feature/Api/Permissions`,
  `ProcessRoleDelegationsJobTest`) → 59 verts. **Ablations** (après commit) : `coversAssignee`
  retiré → rouge ; routage retiré → rouge ; absence écrite en rôle `agency_admin` → rouge (les
  capacités du remplaçant changent) ; filtre de la console des délégations retiré → rouge ;
  garde de `NotifyDelegationRevoked` retirée → rouge (une notification part) ; contrôle de
  chevauchement retiré → rouge.
- **§8 retrait et passation** (`c20440e8`, `+1`) — re-mesuré : `AgencyController.php:225-266` exigeait
  un `AgentProfile` (admin seul → 422 `user_not_in_agency`), sans journal, autorisé par
  `can('update', $agency)` ; `AgentInvitationService::remove` journalisait sous `Invitation` : conforme.
  `AgentPortfolio` porte UNE requête par catégorie, partagée par l'inventaire, la passation et la
  garde `portfolio_not_empty` (qui rend les comptes). Seul le travail en cours compte (tâches
  ouvertes, visites à venir planifiées/confirmées, interventions non closes). **Écarts** :
  `held_properties` est compté mais non transmis (TCK-504) — un agent qui tient des biens de
  l'agence ne se retire donc qu'avec `leave_unassigned` d'ici là ; le retrait révoque aussi les
  délégations et absences où figure le membre ; `AgentInvitationService::remove` garde la
  suppression directe pour une invitation jamais acceptée (profil sans compte) ; `team.remove` est
  lue sous le profil actif de l'agence de la route plus le court-circuit `primary_admin_id`
  (`AgencyPolicy::removeMember`). L'éligibilité d'une intervention (TCK-592) est, avant sa fusion,
  le personnel de l'agence : le repreneur l'est toujours, aucune désassignation n'est donc
  observable aujourd'hui. `php artisan test tests/Feature/Agency/{AgencyMemberRemovalTest,AgentHandoverTest,AgentRemovalJournalTest}.php`
  → 12 verts ; `TeamFormationBoundaryTest`, `TeamManagementTest`, `AgencyMembersListTest`,
  `LastAdminGuardTest`, `AgencyRoleAssignmentTest`, `AgencyIndividualCustomRolesTest`,
  `InviteAgentTest` → 65 verts. **Ablations** (après commit) : `authorizeAdmin` rétabli → AC13
  rouge ; garde de portefeuille retirée → rouge ; journal retiré → rouge ; révocation du flux
  retirée → **vert** d'abord (le flux mourait quand même : `CalendarFeedService::resolve` refuse un
  non-personnel), d'où l'assertion `revoked_at` ajoutée, puis rouge ; exigence d'`AgentProfile`
  rétablie → AC23 rouge ; dédoublonnage des collaborations retiré → rouge ; transaction retirée →
  « erreur à mi-parcours » rouge ; repreneur bailleur accepté → rouge.
- **§7 `bulk-visibility`** (`86a6da43`) — livré en avance sur TCK-504 parce qu'il n'en dépend pas
  (dépublier ne touche ni `user_id` ni l'agent responsable) ; `bulk-assign`, `assignAgent`, la règle
  de cible, `ResponsibleAgentAssigner` et la commande de réparation **attendent TCK-504**. Re-mesuré :
  `bulk-archive` (`PropertyController.php:297-314`) valide `exists:properties,id` — un identifiant
  inconnu y est un 422 ; `bulk-visibility` le rend au contraire en `not_found` dans le bilan, comme
  l'exige AC5. Au plus 100 identifiants (Contrat). `php artisan test tests/Feature/Property/PropertyBulkVisibilityTest.php`
  → 3 verts. **Ablations** : contrôle `update` retiré → rouge (le bien de l'autre agence passe) ;
  transaction retirée → rouge (le premier bien reste dépublié après la panne injectée au second).
- **Front** (`4f8cf536` → `57ec39c4`, onze commits) — re-mesuré : la fiche et le tiroir appelaient
  `/api/audit-log` (403 avalé en liste vide, `CustomerDetailSheet.tsx:58-60`), le kanban ne déclarait
  que `PointerSensor` et jetait la `meta`, « Tâches du jour » bouclait sur `/app/overview/agent`,
  `/app/calendar` redirigeait le prestataire, l'écran Équipe proposait « Retirer » sur toute ligne :
  conformes au Contexte. **Deux défauts d'API trouvés par le front** et corrigés (`57803016`) :
  `gte:budget_min` refusait un plafond seul (la règle échoue quand l'autre champ est nul) ;
  `CustomerResource` ne rendait pas les critères. `ProspectMatchController::perPage()` renommé
  `pageSize()` (nom réservé par `check-pagination-envelope`). Écarts : « Changer l'agent
  responsable » reste unitaire tant que `bulk-assign` attend TCK-504 (la case du front §7 reste
  ouverte) ; le select « Qui est absent » n'est proposé qu'avec `team.delegate_role` (la policy
  `declareAbsence` en est juge) ; le pipeline reste **atteignable par URL** pour un bailleur (sa garde
  `assertCanReachAgentArea` est inchangée : « surface partagée agence + bailleur », gardée par
  `garde.test.tsx`) — seul le lien disparaît, l'API (§9 `scopeVisibleTo`, après 587) bornera ce qu'il
  y lit. `ConfirmRemoveDialog`, orphelin, est supprimé.
  Tests nommés : `CustomerActivityFeed`, `noteBody`, `CustomerForm.doublon`, `CustomerMatches`,
  `CustomerLinkedRecords`, `PipelineKanban.pagination`, `taches-du-jour.tck-591`, `MyTasks`,
  `CalendarPage.audience.tck-591`, `calendar.tck-591`, `PropertyList.bulk.tck-591`,
  `AdminUsersTable.retrait.tck-591`, `HandoverWizard`, `AgentAbsencesSection`,
  `PropertyMatchingCustomers`, `personnel.tck-591`, `CustomerStageControl` ; `vitest run src/app
  src/components/crm src/components/customer-dashboard src/lib` → 1660 verts ; `src/components/admin`
  → 300 verts ; lint, `tsc --noEmit`, `check:i18n` propres. API : `CustomerCriteriaValidationTest`
  (rouge avant le correctif), `CustomerNoteKindTest`, `AgencyMemberRemovalTest`,
  `CalendarNewTypesTest`, `TaskAuthorizationTest` → 21 verts, 2 sautés (587).
  **Ablations** (après commit, restaurées par `git checkout HEAD --`) : état d'erreur du journal
  (AC24) ; renvoi `allow_duplicate` ; partage WhatsApp des seuls liens publics ; totaux de
  `stage_counts` (AC25) ; lien « Tâches du jour » (AC26) ; garde de l'agenda du prestataire (AC27) ;
  sélection des refus et rafraîchissement (AC28) ; palette `maintenance` sous le seuil de contraste
  (le test TCK-484 l'attrape) ; « Retirer » sans `isAgencyStaffRow` → AC23 front rouge (2) ; retrait
  sans repreneur sans l'aveu → rouge ; entrées CRM du bailleur (`staff = true`) → rouge ; prospect
  masqué rendu en lien → rouge ; compte pris sur la page reçue au lieu de `meta.total` → rouge ;
  étape terminale sans motif depuis la fiche → rouge. Toutes rouges, toutes restaurées.
  **AC15 au navigateur** (`e20c2785`) — base jetable `takussan_tck591` (`migrate:fresh --seed`,
  supprimée après), API 8106, front 3106, Chrome sans tête 9346 piloté par CDP, émulation 360 × 740
  `mobile` + tactile, compte `agent@agency1…` (locale `en`). **Premier passage : la fiche client
  tombait en « Something went wrong »** (`MISSING_MESSAGE agentCrm.contact`) : le provider de chaque
  frontière ne sert que les espaces de `i18n/namespaces.json`, que `check:i18n-namespaces` garde —
  et je ne l'avais pas lancée ; vitest, qui passe le dictionnaire entier, ne pouvait pas le voir.
  Table régénérée, statuts des dossiers liés en espaces littéraux. Puis, mesuré : `innerWidth` =
  `scrollWidth` = 360 sur `/app/tasks`, `/app/customers/1`, `/app/crm/pipeline`, `/app/calendar` ;
  étape changée **au clavier** depuis la fiche (focus + saisie « n » → `PATCH …/customers/1/pipeline-stage`,
  `negotiating` en base) et depuis la carte du pipeline (« p » → `PATCH …/553/pipeline-stage`,
  `prospect` en base) ; tâche cochée **au doigt** (`touchStart/End` → `PATCH /api/tasks/75`) et **au
  clavier** (Espace → `PATCH /api/tasks/61`), `done` en base ; WhatsApp **au doigt** (lien 114 × 44)
  → onglet `api.whatsapp.com/send/?phone=221768746179&text=Hello+Oumy%2C+this+is+your+Takussan+agent.` ;
  **0** requête `/api/audit-log` sur la fiche, 2 sur `/activity`. **Non mesuré** : l'étape changée
  **au doigt** — le doigt atteint bien le `<select>` (274 × 44, *hit-test*), mais le choix se fait dans
  le sélecteur natif, que CDP ne pilote pas ; AC15 reste donc ouvert sur ce seul point. Relevé en
  passant, hors 591 : la modale d'accueil de l'agent recouvre la page au premier passage ; les onglets
  de la fiche font 25 px de haut (primitive `Tabs`).
- **Découpage (2026-10-07, décision de la session)** — tout ce qui dépend de TCK-504 sort de 591 vers
  [TCK-603](TCK-603-agent-responsable-bulk-assign-et-biens-a-la-passation.md) (`todo`, après 504 et
  591) : `bulk-assign`, `ResponsibleAgentAssigner`, `assignAgent`, la commande de réparation, le
  front « Changer l'agent responsable » en lot, les catégories de biens de la passation, AC4, AC22,
  AC29, AC30, la part « biens » d'AC12 et la part « select natif au doigt » d'AC15. Les cases
  transférées restent décochées ici, marquées `→ transféré à TCK-603`.

### 2026-10-07 — après la fusion de TCK-587 (`fd4bd805`, PR #329)

- **Fusion** (`732b3f1c`) — conflits : `AgencyController` (le retrait reste délégué à
  `AgencyMemberRemovalService`, sous `removeMember`), `CustomerPolicy` (le `view`/`delete` de 587, plus
  `create` et `matchProperties` de 591 sur `staffAgencyId()` / `isStaffOf()`), console d'équipe
  (suspension de 587 et assistant de passation côte à côte), `INDEX.md` et `namespaces.json`
  régénérés. Le test AC23 perd la prop `onQuickAction`, retirée par 587 (`tsc` l'a signalée).
- **Prédicats** (`cb315e78`) — tiers → `MembershipCapabilityResolver::isStaffAt()` (repreneur,
  référent, assigné de tâche, destinataire du récapitulatif, porteur du flux iCalendar, absent,
  éligible d'intervention) ; appelant → `staffAgencyId()` / `isStaffOf()` (absences, correspondances
  d'un bien, création d'une fiche, agenda et flux). `CalendarEventCollector::staffAgencyIdOf` supprimé.
  Les deux prédicats diffèrent de l'ancienne expression (`isAgentAt || isAgencyAdminAt`, qui ne compte
  plus que les profils actifs depuis 587) par la seule **délégation** active d'un rôle de personnel.
  Gardes : `HORS_DETECTION` de `check-agency-scope-clause` vidée (cliquet 2 → 0) ; lignes
  `team.remove` et `crm.assign` retirées de `CapabilityEnforcementInventory` (cliquet 16 → 14).
- **AC18 entier** — les deux sauts `requiresTck587()` retirés : `TaskAuthorizationTest` 8/8 verts.
  Ablations, restaurées par `cp` : `CustomerPolicy::view` ramené à la règle d'avant 587
  (`$user->agency_id === $model->agency_id`) → les 2 tests rouges ; `TaskPolicy::attachTo` ramené à la
  règle d'avant 591 pour un client → les 2 rouges.
- **§9 + AC16** (`8b54495e`, `24cdb6a6`) — `Customer::scopeVisibleTo(User)`, employé par
  `CustomerController::index` et `PipelineStatsService::scopedQuery` (587 y avait recopié la règle
  deux fois). Ablations, restaurées par `cp` : `index` sur `$user->agency_id` → rouge ;
  `PipelineStatsService` sur `$user->agency_id` → rouge (`4` au lieu de `1`) ; la portée sans
  `crm.view_all` → rouge. **La portée sur `$user->agency_id` restait VERTE** : la capacité seule
  filtrait le bailleur du rôle système. Ajouté : un bailleur dont le rôle d'agence tient
  `crm.view_all` ne voit que sa fiche (`24cdb6a6`) — l'ablation rougit alors.
- **Défaut de fusion trouvé par la suite ciblée** (`fd020958`, `0fe7b82d`) — 587 fait de la visibilité
  un geste `publish` ; `bulk-visibility` jugeait encore `update`. Après fusion, l'agent du rôle
  système (sans `properties.update_any`) était refusé sur tout le lot (`PropertyBulkVisibilityTest`
  rouge), et un bailleur l'aurait été accepté sur son propre bien que `PUT …/visibility` lui refuse.
  Le service juge `publish` ; test ajouté (le bailleur est refusé à l'unité et en lot) ; ablation
  `publish` → `update` → 3 rouges. Front : « Dépublier » en lot n'est proposé qu'avec
  `properties.publish` (`useGestesDuBien`, comme le menu d'un bien) ; ablation → rouge.
- **Tests** (premier plan, `load average` 16 à 32 pendant les passages) : `tests/Feature/Crm`,
  `Calendar`, `Api/Agency`, `Authorization` → 278 verts ; `Agency`, `Property`, `Unit/Policies` et
  voisins → 180 (2 rouges avant le correctif `publish`, verts après) ; toute classe qui appelle
  `/api/customers` ou les compteurs du pipeline → 243 verts. Front : `vitest` sur `admin`,
  `admin-agency`, `calendar`, `crm`, `customer*`, `property-dashboard`, `src/app`, `src/lib` → 2030
  verts + 1 rouge (`PropertyList.bulk` : `useCan` lu depuis 587 sans `QueryClient`), vert après
  `0fe7b82d` ; lint, `tsc --noEmit`, `check:i18n`, `check:i18n-namespaces`, `check:classes-emises`
  propres ; toutes les gardes racine vertes.
- **Relevé hors périmètre, mesuré** : `PipelineStatsService` lit les transitions d'étape dans
  `activity_log.properties`, alors qu'activitylog v5.1 les écrit dans `attribute_changes`. Mesure
  (test jetable, retiré) : un `PATCH …/pipeline-stage` écrit `properties = []`,
  `attribute_changes = {"old":{"pipeline_stage":"lead"},"attributes":{"pipeline_stage":"prospect"}}`,
  et `stage_changes_last_30d` rend **0**. `avg_time_in_stage` lit les mêmes chemins. Non corrigé ici.

### 2026-10-08 — corrections après vérification adverse, puis fusion de TCK-588

- **verif-591 : REFUSÉ (1 bloquant, 5 majeurs, 3 mineurs).** Un commit par point, de `9e27ceee` à
  `95dbf59b` ; preuves au Delta §11 et en AC31 à AC39. Les six sondes du vérificateur, copiées sous
  `tests/Feature/Verif591/`, rougissent toutes après correctif ; elles sont retirées.
- **M1 modifie une règle de TCK-587**, sur décision de la session : dans `CustomerPolicy::view` et
  `Customer::scopeVisibleTo`, la clause « auteur » exige désormais un profil actif (de tout type)
  dans l'agence de la fiche ; une fiche sans agence garde son auteur. Deux tests de TCK-306
  (`MigratedAuthorizationRulesTest`) qui affirmaient l'ancienne règle sont alignés.
- **Trouvé en route** : `CustomerResource::toArray` est appelé directement par les contrôleurs, si
  bien qu'un `mergeWhen` n'y est jamais résolu (la clé `MergeValue` sortait telle quelle) ; m2 étale
  les critères par un tableau. `PropertyBulkArchiveService` garde un constructeur sans argument
  (`new` direct dans un test de TCK-074).
- **Fusion d'`origin/dev`** (`059ce17c`, TCK-588) — conflits : `AgencyController::removeAgent` (le
  service de 591 reste seul chemin), `CalendarController`, `PropertyController::unpublish` (méthode
  partagée de M3), `TaskController::authorizeAssignee` (règle de 591), `INDEX.md`, `adr/README.md`.
- **Conversion aux codes de TCK-588** (`7471b568`, ADR-0032) — plus aucune `HttpResponseException`
  ni réponse d'erreur construite à la main. Codes renommés, **à lire ainsi dans ce ticket** :
  `task_assignee_not_staff` → `task.assignee_not_staff` ; `member_not_staff` → `agency_member.not_staff`
  (retrait) et `agent_handover.member_not_staff` (passation) ; `portfolio_not_empty` →
  `agency_member.portfolio_not_empty` ; `absence_overlaps` → `agent_absence.overlaps` ;
  `calendar_feed_not_staff` → `calendar.feed_not_staff` ; `customer_duplicate` →
  `customer.duplicate` ; `user_not_in_agency` → `agency_member.not_in_agency`. Les charges utiles
  (`existing`, `portfolio`) passent par `ApiError::with()`. Le récapitulatif quotidien est le code
  `prospect_match.digest` (`send()`) ; `data.kind` + `data.digest_date` restent sa clé
  d'idempotence. Front : le 409 de doublon se lit sur `customer.duplicate` (test neuf, rouge sur
  l'ancien code). TCK-603 cite encore `portfolio_not_empty` dans son texte.
- **Vérifié au premier plan** : `tests/Unit` (536), `tests/Feature/{Agency,Crm,Calendar,Notifications}`
  (239), `tests/Feature/Authorization` en entier (151), 25 autres classes qui appellent les routes
  touchées (262) : tous verts. `ProseLitteraleInterditeTest`, `LangGroupParityTest`,
  `check-notification-codes` (32 codes) verts. Pint, lint, `tsc --noEmit`, `check:i18n`,
  `check:i18n-namespaces`, vitest des écrans touchés (83), toutes les gardes racine : verts.

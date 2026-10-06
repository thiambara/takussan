---
id: TCK-591
title: "Le CRM de l'agent ne tient pas au téléphone : numéro libre, pipeline sans geste mobile, tâches sans page, fiche éclatée, agenda partiel et ouvert au bailleur, actions en masse muettes, portefeuille orphelin au départ d'un agent"
status: todo
phase: P1
family: full
estimate: XL
wave: 73
created: 2026-10-06
updated: 2026-10-06
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
- **Prestataire** : ses interventions planifiées apparaissent dans un calendrier (sous réserve de
  TCK-446).

## Contexte

Analyse par acteur du 2026-10-06, vague 73 (points A9-A13, A16, A17 du rapport agent ; AD14 du
rapport admin d'agence ; partie calendrier de P17 du rapport prestataire). **Chaque constat a été
re-mesuré** sur l'arbre `e3ab4a4e` ; trois sont corrigés par rapport aux rapports, deux sont neufs.

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

**4. Deux fiches client, et l'onglet Activité toujours vide pour l'agent (A12).** La fiche pleine
page a quatre onglets (`CustomerDetailTabs.tsx:50-53`), le tiroir quatre autres
(`CustomerDetailSheet.tsx:163-166`) ; aucune ne montre visites, réservations ou baux, pourtant
filtrables (`PropertyVisit.php:34`, `Booking.php:44`, `Lease.php:75` par `tenant_id`).
**Neuf :** l'onglet Activité appelle `/api/audit-log` (`CustomerDetailSheet.tsx:45-61`), que
`IndexAuditLogRequest::authorize` (l.29-35) réserve au super-admin et à l'admin d'agence. Pour un
agent : 403, avalé en `[]` (l.58-60) — l'onglet est **vide en silence** pour son premier usager.

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
biens de l'agence. La branche collaborateur (`:63`) exige `accepted_at`, que rien n'écrit
(relevé de TCK-504). **Corrigé (P17) :** le prestataire ne voit pas un calendrier vide — le
raccourci le lui pousse (`DashboardShortcuts.tsx:76-79`) mais la page le **redirige**
(`calendar/layout.tsx:39` → `lib/auth/guards.ts:35-38`).

**7. Actions en masse non atomiques et muettes (A17).** Archiver, dépublier et réattribuer lancent
un `Promise.all` d'appels unitaires (`PropertyList.tsx:114-133`, `:313-329`) ; au premier échec,
seul son message s'affiche et la sélection reste entière, succès compris (l.124-127). L'endpoint
`POST properties/bulk-archive` existe (TCK-074 : `routes/api/properties.php:20`,
`PropertyController::bulkArchive` l.297-314, motifs d'échec en codes), mais seul le super-admin
l'appelle (`lib/queries/super-admin.ts:505`). « Réattribuer » écrit `properties.user_id`
(`PropertyController::assignAgent` l.254) après un contrôle d'appartenance qui laisse passer un
**bailleur** de l'agence (l.247-251, même accesseur).

**8. Un agent qui part laisse son portefeuille à un absent (AD14).** **Corrigé :** l'écran Équipe
(`TeamConsole.tsx:196` → `lib/queries/agency-members.ts:113-125`) appelle
`AgencyController::removeAgent` (l.225-266), qui supprime les profils **sans aucune journalisation**
; `AgentInvitationService::remove` (l.163-185, journalisé) n'est atteint que par
`DELETE /api/profiles/{agent_profile}`, qu'aucun écran n'appelle. Aucun des deux ne touche aux
tâches (`tasks.assigned_to_id`), visites (`property_visits.agent_id`), interventions
(`maintenance_requests.assigned_to`), collaborations (`property_collaborators.user_id`), biens dont
l'agent est responsable (`properties.user_id`), ni aux clients dont il est référent.
**Corrigé :** le référent client **existe** (`user_customer_relationships` `agent_client` +
`is_primary`, `CustomerController::setPrimaryContact` l.121-142, spec §1.6 P1), mais aucun écran ne
le pose, et l'endpoint accepte **n'importe quel utilisateur de la plateforme**
(`SetPrimaryContactCustomerRequest.php:36`, `exists:users,id`). `Capability::CrmAssign` n'a aucun
lecteur. Côté absence, `RoleDelegation` ne sait pas dire **qui** est absent (`delegator_id` = l'admin
auteur) et n'accorde que des capacités que le remplaçant détient déjà.

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

**Endpoints** (tous sous `auth:sanctum`, enveloppe JSON standard, sparse fieldsets) :

| Méthode | Route | Contrôleur | Rôle |
|---|---|---|---|
| POST/PUT | `customers`, `customers/{c}` | `CustomerController::store/update` | téléphone normalisé ; doublon → **409** `customer_duplicate` + `existing[]` (id, nom, `matched_on`), sauf `allow_duplicate=true` |
| GET | `customers/{c}/activity` | `CustomerController::activity` | journal du client, de ses notes et de ses tâches ; autorisé par `view` du client |
| POST | `customers/{c}/primary-contact` | `CustomerController::setPrimaryContact` | référent = personnel de l'agence du client, capacité `crm.assign` |
| GET | `customers/{c}/matching-properties` | `Crm\ProspectMatchController::forCustomer` | biens de l'agence qui correspondent |
| GET | `properties/{p}/matching-customers` | `Crm\ProspectMatchController::forProperty` | prospects de l'agence qui correspondent (compte + liste) |
| GET | `tasks?filter[due]=overdue\|today\|upcoming\|none` | `TaskController::index` | + `taskable: {type: customer\|property, id, label}` dans la réponse |
| GET | `calendar?types[]=…&mine=1` | `CalendarController::index` | types `task`, `lease_event`, `maintenance` en plus ; fenêtre ≤ 186 jours (422 au-delà) |
| POST/DELETE | `me/calendar-feed` | `CalendarFeedController::store/destroy` | crée / fait tourner / révoque le lien d'abonnement (rendu **une seule fois**) |
| GET | `calendar-feed/{token}.ics` | `CalendarFeedController::show` | public, `text/calendar`, limité en débit — forme exacte tranchée par l'ADR |
| POST | `properties/bulk-visibility` | `PropertyController::bulkVisibility` | dépublier en lot (`visibility=private` seulement) |
| POST | `properties/bulk-assign` | `PropertyController::bulkAssign` | réattribuer en lot |
| GET | `agencies/{a}/members/{u}/portfolio` | `Agency\AgentHandoverController::show` | inventaire du portefeuille, compté par type |
| POST | `agencies/{a}/members/{u}/handover` | `Agency\AgentHandoverController::store` | passation (repreneur unique ou par type), puis retrait si demandé |

Les deux `bulk-*` rendent la forme de `bulk-archive` : `updated`, `updated_ids`, `failed[{id, reason}]`
avec `reason` ∈ `not_found | forbidden | invalid_target | unchanged` — des **codes**, jamais de prose.
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

## Contraintes strictes (métier)

1. **Cloisonnement** : toute lecture et écriture reste dans l'agence du profil actif. Le
   rapprochement, le calendrier, les `bulk-*`, le référent et la passation jugent le **personnel de
   l'agence** (agent | admin d'agence) par le prédicat de TCK-587 ; avant sa fusion, l'expression
   équivalente `isAgentAt || isAgencyAdminAt` avec un commentaire `TCK-587` (règle commune 3). Un
   bailleur n'est jamais repreneur, référent, ni cible d'une réattribution.
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
   l.100-101 et l.192-193, `CalendarController` l.51, `TaskController` l.89). Clés i18n en ajout seul,
   dans un bloc `crm.*` / `calendar.*` / `team.handover.*` propre au ticket.
8. **Migrations** : index et FK nommés (< 63 caractères), `down()` exact ; aucune `enum()` ; `jsonb`.
9. **Coordination vague 73** — ce ticket ne prend que son territoire de la CARTE, plus
   `AgencyController::removeAgent` (l.225-266, non revendiqué) :
   - **587** possède `CustomerPolicy`, `PropertyPolicy`, `TeamConsole` (libellés) et la garde
     « capacité sans lecteur » : 591 devient lecteur de `crm.assign` et de `team.remove` — à
     arbitrer avec 587 pour qu'aucune capacité ne soit lue deux fois de façon divergente.
   - **590** possède les écrans visites et leads : ils adoptent le même geste « Appeler / WhatsApp »,
     la conversion lead → client passe par la normalisation et le détecteur de doublons de 591, et
     le routage des leads/visites consomme le résolveur d'absence. L'onglet Visites de la fiche
     dépend du périmètre de `PropertyVisitController::index` (590).
   - **592** possède tout `Maintenance*` : 591 ne fait que lire `MaintenanceRequest` (calendrier) et
     écrire `assigned_to` à la passation, sous sa règle d'éligibilité.
   - **595** possède `overview/*` : 591 n'y change que l'`href` de « Tâches du jour » (une ligne).
   - **504** : le drapeau de collaborateur principal, s'il existe, suit le collaborateur.
   - **446** statue dans la spec sur le calendrier du prestataire ; 591 n'ouvre la page au
     prestataire que si cette décision le dit (option recommandée : oui, type `maintenance` seul).

## Delta à produire

**0. Décisions préalables**
- [ ] ADR à écrire et accepter **avant le code** : *« Comment un agenda sort-il de la plateforme ? »*
      — lien secret par utilisateur (table `calendar_feeds` : `user_id`, `agency_id`, `token_hash`,
      `revoked_at`, `last_accessed_at` ; recommandé) contre jeton Sanctum à portée restreinte ;
      contenu des événements ; durée de vie ; révocation au retrait de l'agent.
- [ ] ADR à écrire et accepter **avant le code** : *« Comment dit-on qu'un agent est absent, et qui
      reprend ? »* — recommandé : étendre `role_delegations` d'une colonne `replaces_user_id`
      (FK `role_delegations_replaces_user_fk`, nullable) et réutiliser activation / expiration /
      évènements ; alternative : table `agent_absences`. Trancher aussi les effets (routage des
      nouvelles assignations, vue des tâches).

**1. Numéro fiable et geste de contact (A9)**
- [ ] `App\Services\Crm\CustomerPhoneNormalizer` (s'appuie sur `PhoneNumber`, `+221` par défaut) ;
      `TelephoneJoignable` sur `phone` et `emergency_contact_phone` dans `Store/UpdateCustomerRequest`.
- [ ] `App\Services\Crm\CustomerDuplicateDetector` (même agence, téléphone normalisé ou e-mail replié)
      → 409 `customer_duplicate` ; champ `allow_duplicate` (bool) dans les deux FormRequests.
- [ ] Commande `crm:normalize-customer-phones {--dry-run}` : compte normalisés / non normalisables.
- [ ] Front : saisie de téléphone du profil (TCK-574) dans le formulaire client ; gestes « Appeler » et
      « WhatsApp » sur la fiche, la carte de pipeline et la tâche ; doublon présenté comme une aide.

**2. Pipeline (A10)**
- [ ] Front : changement d'étape sans glisser (carte et fiche), capteur clavier et annonces
      accessibles, pagination « charger plus », compteurs tirés de `stage_counts`.

**3. Tâches (A11)**
- [ ] `Task` : filtre `due` (`AllowedFilter::callback`, fuseau `Africa/Dakar`) ; `TaskController::format`
      ajoute `taskable {type, id, label}`.
- [ ] Front : page « Mes tâches » (filtres, cocher, créer une tâche sur un client ou un bien) ; lien
      « Tâches du jour » du tableau de bord agent vers elle.

**4. Fiche client unique (A12)**
- [ ] `CustomerController::activity` + route `customers.activity` ; relation `Customer::visits()`.
- [ ] Front : une seule fiche (aperçu, notes, tâches, activité, visites, réservations, baux,
      documents, relations) ; le tiroir en est la vue réduite ; plus d'appel à `/api/audit-log`.

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
      ses biens seulement) ; `task` (personnelles, `due_at`), `lease_event` (`end_date`,
      `renewal_date`), `maintenance` (`scheduled_at` ; personnel : biens de l'agence ; prestataire :
      `assigned_to = moi`) ; `mine=1` = `agent_id`/`assigned_to_id`/`assigned_to` = moi.
- [ ] `CalendarFeedController` + `IcsCalendarRenderer` selon l'ADR ; révocation des flux au retrait.
- [ ] Front : types, légende et filtre « Mes rendez-vous » ; abonnement ; ouverture de la page au
      prestataire **si** TCK-446 le décide.

**7. Actions en masse (A17)**
- [ ] `PropertyBulkVisibilityRequest`, `PropertyBulkAssignRequest` ; `PropertyBulkVisibilityService`,
      `PropertyBulkAssignService` sur le modèle de `PropertyBulkArchiveService` ; routes déclarées
      avant `{property}` (`routes/api/properties.php:19`).
- [ ] Front : les trois actions passent par `bulk-*` ; bilan chiffré ; seuls les refus restent
      sélectionnés.

**8. Passation et absence (AD14)**
- [ ] `App\Services\Agency\AgentHandoverService` (`inventory()`, `transfer()`) ; `AgentHandoverController`
      + `StoreAgentHandoverRequest` (repreneur unique ou par catégorie, `leave_unassigned`,
      `remove_after`) ; autorisation par `team.remove`.
- [ ] `AgencyController::removeAgent` délègue à `AgentInvitationService::remove`, qui journalise et
      refuse un portefeuille non vide sans passation ni `leave_unassigned`.
- [ ] `SetPrimaryContactCustomerRequest` : `user_id` = personnel de l'agence du client ; capacité
      `crm.assign` ; front : désigner le référent depuis la fiche.
- [ ] Absence selon l'ADR (migration, service, résolveur `AgentAvailability::substituteFor()`),
      `TaskPolicy::view` étendu au remplaçant pendant la période.
- [ ] Front : assistant de passation déclenché par « Retirer » ; « Déclarer une absence ».

**9. Tests**
- [ ] `CustomerPhoneAndDuplicateTest`, `CustomerActivityEndpointTest`, `PrimaryContactScopeTest`,
      `ProspectMatcherTest`, `SendProspectMatchDigestTest`, `TaskDueFilterTest`,
      `CalendarScopeTest`, `CalendarNewTypesTest`, `CalendarFeedTest`, `PropertyBulkVisibilityTest`,
      `PropertyBulkAssignTest`, `AgentHandoverTest`, `AgentRemovalJournalTest`, `AgentAbsenceTest` ;
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
      en `failed` avec `invalid_target` et ne modifie pas `user_id`.
- [ ] AC5 — sur 5 biens dont 1 d'une autre agence et 1 déjà privé, `bulk-visibility` rend
      `updated = 3`, `failed` = `[{forbidden}, {unchanged}]` + l'identifiant inconnu en `not_found` ;
      une exception levée au 2ᵉ bien autorisé laisse les 3 inchangés (transaction).
- [ ] AC6 — `GET /api/customers/{c}/activity` rend **200** à un agent de l'agence avec au moins le
      changement d'étape et la note créés dans le test ; **403** à un agent d'une autre agence.
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
      collaborations (dont une où le repreneur collabore déjà), 1 bien et 2 clients référents : après
      `POST …/handover`, tout est au repreneur, la collaboration en double n'existe qu'une fois,
      `activity_log` porte une entrée par catégorie ; une erreur injectée à mi-parcours ne déplace rien.
- [ ] AC13 — `DELETE /api/agencies/{a}/members/{u}` sur un agent au portefeuille non vide, sans
      passation ni `leave_unassigned`, rend 422 ; avec, il journalise `agent_removed` (rouge sur le
      code actuel, qui ne journalise pas).
- [ ] AC14 — pendant une absence active de X remplacé par Y, Y voit les tâches de X et le résolveur
      rend Y ; après la date de fin, plus rien ; aucune ligne existante n'a changé.
- [ ] AC15 — front : depuis un écran de 360 px, au clavier comme au doigt, l'agent change l'étape
      d'un client, coche une tâche, et ouvre WhatsApp sur le bon numéro avec le message prérempli ;
      la console ne contient plus d'appel à `/api/audit-log` depuis la fiche client.

## Hors périmètre

- Le contrôle d'accès des policies `Customer`/`Property` (`update`, `destroy`) : TCK-587.
- Écrans de visites et de leads, création de visite, routage des leads : TCK-590 (il consomme le
  détecteur de doublons, le geste de contact et le résolveur d'absence).
- La vue terrain « Mes interventions » du prestataire et la règle d'éligibilité des assignations :
  TCK-592. La spec du calendrier prestataire : TCK-446.
- Commissions et compteurs du tableau de bord agent : TCK-595. Choix de l'agent principal : TCK-504.
- Publication en lot ; campagnes e-mail/SMS ciblées (§1.6 P3) ; mode hors ligne (supprimé, A18).
- Envoi automatique au prospect sans compte (alertes de recherche : TCK-599).

## Notes d'implémentation

_(à remplir par implementing-specs)_

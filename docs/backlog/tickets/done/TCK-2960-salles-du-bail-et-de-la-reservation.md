---
id: TCK-2960
title: "Les salles du bail et de la réservation : un fil unique par objet, des membres synchronisés sur les parties, une branche d'accès par sujet"
status: done
phase: P1
family: back
estimate: L
wave: 94
created: 2026-11-17
updated: 2026-11-18
depends_on: [TCK-2957, TCK-2955]
blocks: [TCK-2961, TCK-2963]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models:
    - docs/models-spec.md#18-conversation-
    - docs/models-spec.md#19-conversationparticipant-
    - docs/models-spec.md#14-lease-
    - docs/models-spec.md#5-booking
    - docs/models-spec.md#7-customer
tags: [back, messagerie, le-fil, salles, bail, reservation, acces, migration, adr-0128]
---

## Objectif utilisateur

- **Locataire, bailleur, agent d'un bail ; candidat et contact principal d'une réservation** : chaque
  bail et chaque réservation a son fil, où se retrouvent exactement ses parties, et qui suit leurs
  changements sans que personne n'ait à inviter qui que ce soit.

## Contrat de données

- ADR-0128 § 2 (membres, unicité, synchronisation, accès, lecture seule), ADR-0068 (le contact
  principal suit le bien), ADR-0053 (`PrimaryPropertyContact`), règle des contextes fermés
  (`ConversationAccess::contexteFerme`, `contextAllowsWriting`, TCK-2753).
- **Salle du bail** : `type = lease`, sujet `lease:<id>` ; contexte `lease_id` **et** `property_id` du
  bail posés (la branche de contexte de `ConversationAccess` en dépend). Membres : le compte du
  locataire (`leases.tenant_id` → `customers.user_id`, s'il existe), le bailleur désigné
  (`landlord_id`), l'agent attribué (`agent_id`).
- **Salle de la réservation** : `type = booking`, sujet `booking:<id>` ; contexte `property_id`.
  Membres : le compte du candidat (`bookings.customer_id` → `customers.user_id`), le contact principal
  du bien (`PrimaryPropertyContact::for`).
- `conversations.subject` (le titre) reste nul : le front compose le nom de la salle depuis l'objet.
- `conversations.created_by` (non nul, clé vers `users`) : l'agent du bail, à défaut le bailleur, à
  défaut le propriétaire du bien ; pour une réservation, `created_by_id`, à défaut le contact
  principal, à défaut le compte du candidat. Sans aucun compte, la salle n'est pas créée (journalisé).
- **Endpoint neuf** — `POST /api/conversations/rooms` `{subject_type, subject_id}` : ouvre la salle
  (la crée si elle manque, synchronise ses membres) et la rend comme `GET
  /api/conversations/{conversation}` (avec `abilities.can_send_message`). 200 si elle existait, 201
  sinon ; 403 si l'appelant ne lit pas l'objet ou n'est pas membre après synchronisation ; 422 pour
  un `subject_type` qui n'a pas de salle. C'est l'entrée depuis la fiche (TCK-2963).

## Contraintes strictes (métier)

- **Unique par sujet** : index unique partiel `conversations_salle_unique` sur `(subject_type,
  subject_id)` `WHERE type IN ('lease','booking') AND subject_type IS NOT NULL AND deleted_at IS
  NULL`. Création par `insertOrIgnore`, puis relecture : jamais de `try/catch` sur la violation
  d'unicité (piège PostgreSQL n° 1, la transaction serait abandonnée).
- **Synchronisation** sur le patron de `SyncMaintenanceConversation`, sans passer par les gestes
  d'administration d'un groupe (`GroupConversationService::addParticipants` exige un acteur et envoie
  des invitations) : les participations s'écrivent par `insertOrIgnore` sur l'unicité existante
  `(conversation_id, user_id)`, remise de `left_at` à nul pour qui revient, `left_at` posé pour qui
  n'est plus partie. Aucune invitation, aucune notification.
- **Signal** : `insertOrIgnore` et les mises à jour en masse ne passent pas par les événements de
  modèle, donc pas par `EmetDesSignaux` de `ConversationParticipant` (TCK-2955). Une synchronisation
  qui change les membres émet elle-même `participants.updated` sur le fil, et `boite.updated` à
  chaque personne ajoutée ou retirée, par l'émetteur du lot 0 (`TempsReel::signaler($salle, CodeDeSignal::ParticipantsUpdated)` et `TempsReel::signalerA($personnes, CodeDeSignal::BoiteUpdated, $salle)` ; noms de cas à relire dans l'enum de TCK-2952 ; tests par `TempsReel::fake()`), après le
  COMMIT. Une synchronisation qui ne change rien n'émet rien.
- **Déclencheurs** (après le COMMIT de l'écriture qui les cause) :
  - bail créé, ou bail dont `landlord_id`, `agent_id` ou `tenant_id` change (`LeaseObserver`,
    `wasChanged`) ;
  - fiche client liée à un compte : `CustomerService::linkUser` est le seul chemin relevé qui pose
    `customers.user_id` (invitation, `InvitationService::lierLaFiche`) → les salles des baux et des
    réservations de cette fiche ;
  - réservation créée : `BookingRequested` (une seule source, quelle que soit la porte d'entrée) ;
  - **le contact principal n'a pas de point unique de changement** (ADR-0068 le juge à la lecture) :
    la salle de réservation le **transmet à l'écriture**, comme `PropertyConversationResolver`
    transmet le fil d'un prospect : à chaque ouverture par `POST /api/conversations/rooms` et à chaque
    événement écrit dans la salle (TCK-2961). Entre-temps, la branche d'accès refuse l'ancien contact.
- **Accès** — `ConversationAccess` gagne une branche « salle » dans `allows`, `allowsWriting` **et**
  `constrainListing` :
  - participation active **et** `view` de l'objet (par `SujetsDuFil`), l'objet résolu **sans les
    supprimés** : la salle d'un bail ou d'une réservation supprimés devient illisible, comme le fil
    d'une intervention supprimée aujourd'hui (`maintenanceAllows`) ;
  - salle de réservation : un participant qui n'est pas le candidat n'y a accès que s'il est le
    contact principal **actuel** du bien (la règle de `prospectAllows`, étendue ; pour la liste, sur
    le patron de `answeredPropertyIds`).
- **Lecture seule** (`allowsWriting` → `false`, saisie cachée par `abilities.can_send_message`) :
  - **bail fini** : statut dans une liste explicite `expired`, `terminated`, `renewed`. Pas
    `Lease::ONGOING_STATUSES`, qui fermerait aussi `draft` et `pending_signature` ;
  - **réservation close sans avoir eu lieu** : `rejected`, `cancelled`, `expired` (les causes de
    `BookingClosed`). `completed` reste ouverte (caution, suites du séjour) ;
  - **bailleur parti ou suspendu** : lecture seule par la règle existante (`contextAllowsWriting`),
    que la salle du bail reçoit parce qu'elle porte `lease_id` ;
  - fil `closed` (TCK-2957).
- Une salle **ne s'administre pas à la main** : `ConversationPolicy` refuse déjà ajout, retrait,
  renommage et départ hors d'un `group` (`isActiveAdmin`, `removeParticipant`), et `POST
  /api/conversations` n'admet que `direct` et `group` (`StoreConversationRequest`, règle `type`). Un
  test garde les deux, pour les deux types.
- Salle créée **quel que soit le statut** du bail (brouillon compris) : le locataire n'y entre que si
  `LeasePolicy::view` le lui accorde déjà.

## Delta à produire

- [ ] Migration `add_room_unique_index_to_conversations` : l'index unique partiel ; `down()` le retire.
- [ ] `App\Services\Messaging\SallesDuFil` : `ouvrir(Lease|Booking): ?Conversation` (création unique
  et synchronisation), `membresAttendus(...)`, `synchroniser(Conversation)`.
- [ ] `LeaseObserver` : `created` et `updated` (parties changées) → `SallesDuFil`, après le COMMIT.
- [ ] Observateur de `Customer` (`updated`, `user_id` changé) → salles de ses baux et réservations.
- [ ] Écouteur `OpenBookingRoom` sur `BookingRequested`.
- [ ] `ConversationAccess` : branche « salle » dans `allows`, `allowsWriting`, `constrainListing` ;
  lecture seule du bail fini et de la réservation close.
- [ ] `POST /api/conversations/rooms` : `ConversationRoomController@store`, `OpenRoomRequest`
  (`subject_type` parmi les types à salle du registre, `subject_id` entier ; `authorize` : `view` de
  l'objet résolu par `SujetsDuFil`) ; route dans `routes/api/conversations.php`, déclarée avant
  `conversations/{conversation}`.
- [ ] Commande `messaging:open-rooms` : ouvre les salles des baux et réservations existants (par
  paquets, idempotente, `whereNotExists` sur la salle), et l'appel dans
  `takussan-api/docker/release.sh` après `migrate` (relire le script d'abord).
- [ ] Tests :
  - `SalleDuBailTest` — membres à la création ; changement d'agent, de bailleur, de locataire ;
    locataire sans compte absent, puis présent quand sa fiche est liée ; bail `expired`,
    `terminated`, `renewed` en lecture seule, `draft`, `active`, `terminating` en écriture ;
    bailleur suspendu en lecture seule ;
  - `SalleDeLaReservationTest` — membres ; changement du contact principal : l'ancien perd l'accès
    tout de suite, le nouveau entre à l'ouverture ; réservation `rejected` en lecture seule ;
  - `SalleSignauxTest` — un changement de membre émet `participants.updated` et `boite.updated` aux
    seules personnes ajoutées ou retirées (faux émetteur du lot 0) ; une synchronisation sans
    changement n'émet rien ;
  - `SalleUniqueTest` — deux ouvertures pour un même objet rendent la même salle ; la course est
    couverte par l'index (deux `insertOrIgnore` successifs, une ligne) ;
  - `ConversationRoomControllerTest` — 201 puis 200 ; 403 pour un non-lecteur ; 422 pour
    `subject_type = maintenance_request` et pour un type hors registre ;
  - `SalleNonAdministrableTest` — ajout, retrait, renommage, départ refusés ; `POST
    /api/conversations` avec `type: lease` ou `booking` refusé 422 ;
  - liste : une salle apparaît dans `GET /api/conversations` pour ses membres qui lisent l'objet, et
    pour eux seuls ;
  - `OpenRoomsCommandTest` — idempotente.

## Critères d'acceptation

- [ ] **AC1** — Les membres d'une salle sont exactement les parties de l'objet, après chaque
  changement de partie. *Ablation : retirer le déclencheur `LeaseObserver::updated` rend rouge le
  changement d'agent ; retirer l'observateur de `Customer` rend rouge le locataire qui ouvre son
  compte.*
- [ ] **AC2** — Un membre qui ne lit plus l'objet n'a plus accès à la salle, en lecture comme dans la
  liste. *Ablation : retirer la branche « salle » de `allows` rend rouge la lecture ; la retirer de
  `constrainListing` rend rouge la liste.*
- [ ] **AC3** — L'ancien contact principal d'une réservation perd la salle dès le changement, avant
  toute écriture. *Ablation : retirer la condition du contact actuel rend ce test rouge.*
- [ ] **AC4** — Un bail `expired`, `terminated` ou `renewed` garde la lecture et refuse l'écriture ;
  `draft` et `pending_signature` l'acceptent. *Ablation : remplacer la liste explicite par
  `ONGOING_STATUSES` rend rouge le cas `draft`.*
- [ ] **AC5** — Une seule salle par objet, même ouverte deux fois de suite ; aucune exception de
  violation d'unicité n'est attrapée dans le code.
- [ ] **AC6** — Après `messaging:open-rooms`, chaque bail et chaque réservation qui a au moins un
  compte possible a sa salle ; une seconde exécution ne crée rien.
- [ ] **AC7** — Personne ne peut créer, ajouter, retirer, renommer ni quitter une salle à la main.
- [ ] Pint propre ; tests des classes touchées verts.

## Hors périmètre

- Les événements des objets dans leur salle : TCK-2961.
- La salle à l'écran et l'entrée depuis la fiche : TCK-2963.
- Le locataire sans compte dans sa salle : lot 5 (pont WhatsApp et SMS).
- Une salle pour la visite ou l'état des lieux (ADR-0128 § 2, décision 3a : non).
- Un avis système à l'entrée ou à la sortie d'un membre de salle (la liste des membres suffit au
  lot 1).
- L'attribution d'une salle à une personne de l'agence (`assigned_to_id`) : lot 2.

## Notes d'implémentation

### Re-mesure (2026-11-18, arbre `feat/le-fil`, après TCK-2955 `344aa99a0`)

- **Écriture des participations : par le MODÈLE, pas par `insertOrIgnore`** (consigne de la session, d'après
  TCK-2955). Le ticket demandait `insertOrIgnore` sur `(conversation_id, user_id)` puis une émission à la main ;
  les participations passent par `attach()` (pivot `ConversationParticipant`, `->using()`) et
  `forceFill()->save()`, et c'est le trait `EmetDesSignaux` du pivot qui émet `participants.updated` et
  `boite.updated` à la seule personne concernée, après le COMMIT. La course sur l'unicité est fermée par le
  verrou de la ligne de la salle (`lockForUpdate`, patron de `GroupConversationService::addParticipants`) :
  deux synchronisations simultanées se sérialisent, la seconde voit ce que la première a écrit. Aucune
  émission manuelle (elle doublerait le trait).
- **Index partiel** : `type IN ('lease','booking') AND subject_type IN ('lease','booking') AND deleted_at IS
  NULL`. Le ticket disait `subject_type IS NOT NULL` : la reprise de TCK-2957 a posé `maintenance_request` sur
  des DIRECTES, et `FilFermeEcritureTest` crée des GROUPES de sujet `booking` — aucun n'est une salle.
- **Les gardes de groupe** : `ConversationPolicy::isActiveAdmin` et `removeParticipant` refusent hors `group` ;
  `StoreConversationRequest` n'admet que `direct`/`group` : confirmés, inchangés. ⚠ Le `Gate::before` du
  super-admin passe outre toute politique (comme pour tout fil) : « personne » vaut hors super-admin.
- **Écrivains de `customers.user_id`** : `CustomerService::linkUser` (aussi appelé par `rattacherOuCreer`,
  fiche orpheline) — par le modèle, donc vu par l'observateur ; `Customer::create` avec `user_id` (fiche neuve,
  sans bail ni réservation) ; `AccountDeletionService` remet `user_id` à nul EN MASSE (compte effacé : non vu,
  noté dans l'en-tête de l'observateur).
- **`BookingRequested`** : dispatché par `BookingService::create` et `PublicPropertyController` (2 sites),
  `ShouldDispatchAfterCommit` ; l'écouteur est découvert dans `app/Listeners/Booking/`.
- **`LeaseObserver::updated`** sortait tôt sur `! wasChanged('status')` : la branche des parties est posée
  AVANT ce retour.
- **`PropertyConversationResolver`** et les recherches de fil de prospect filtrent `type = direct` : une salle
  de réservation (qui porte `property_id`) n'est jamais prise pour un fil de prospect.
- **`MessagingReach`, règle 1 (correspondants)** : dérivée de la co-participation, elle aurait fait de chaque
  partie d'une salle un correspondant — le locataire d'un bail brouillon ou fini aurait joint l'agent, que la
  règle 5 (TCK-2851) borne aux baux EN COURS. Les salles en sont exclues (marqué TCK-2960).
- **Liste** : `Lease::scopeVisibleTo` existe (aligné sur `LeasePolicy::view`) et sert en SQL ; `Booking` n'a
  pas de portée de lecture : jugée en PHP sur les seules salles de réservation où l'appelant participe (patron
  d'`answeredPropertyIds`).

### Choix

- `SallesDuFil::ouvrir()` rend la salle avec `wasRecentlyCreated` = « CET appel l'a créée » (le nombre de
  lignes d'`insertOrIgnore`), lu par le contrôleur (201/200) et par la commande.
- Les déclencheurs (`LeaseObserver`, `SallesDeLaFicheClient`, `OpenBookingRoom`) passent par
  `ouvrirApresLEcriture()` : après le COMMIT, objet relu, et un échec `report()`é — il ne transforme pas en 500
  une écriture déjà validée. Ce n'est pas une garde d'unicité.
- Lecture seule de la salle (bail fini, réservation close) jugée AVANT le passe-droit du super-admin, comme le
  fil `closed` de TCK-2957 : personne n'y écrit.
- `OpenRoomRequest::authorize()` : un type sans salle ou un identifiant mal formé passe à la validation (422) ;
  une demande bien formée dont l'objet est ABSENT ou SUPPRIMÉ reçoit le refus d'un objet tiers (403, corps
  identique) — pas d'oracle d'existence (règle de TCK-1070, `LeaseContextExistenceOracleTest`). 403 aussi,
  dans le contrôleur, pour qui lit l'objet sans être partie (collègue de l'agence).
- Un membre revenu : `left_at` nul, `last_read_at` = maintenant (règle de TCK-861) ; un membre neuf : sans
  `last_read_at` (comme la création d'un groupe).
- `release.sh` : `messaging:open-rooms` après `alerts:ensure-ops-rules`, un échec n'arrête pas le déploiement.

### Mesures (2026-11-18, `load average` 1,4 à 3,7 sur 8 cœurs)

- Classes du ticket, `tests/Feature/Messaging/Salles/` : `SalleDuBailTest`, `SalleDeLaReservationTest`,
  `SalleSignauxTest`, `SalleUniqueTest`, `ConversationRoomControllerTest`, `SalleNonAdministrableTest`,
  `OpenRoomsCommandTest`, `SalleNeFaitPasDeCorrespondantTest` — **49 verts, 250 assertions** (scènes partagées :
  `tests/Support/ScenesDeSalles.php`).
- Gardes : `RessourceUniqueResolueTest`, `ExistsSurTableASuppressionDouceTest`, `AgencyIdIsIndexedTest`,
  `ImpersonationReadSweepTest`, `ValeursEnListeParcoursDesRoutesTest`, `DateInventoryByValueTest` — 37 verts.
  Pint propre. Gardes racine : les sept des maquettes du playground, et `check-nom-affichable`, qui cite
  `takussan-web/src/components/messages/cartes/CarteReservation.tsx` (fichier de TCK-2962, pas de ce ticket).
- **Écrivains EN MASSE des parties d'un bail** (aucun observateur) : `PropertyOwnerTransfer` (l. 99,
  `landlord_id` des baux transférés) et `AgentHandoverService` (l. 180, `landlord_id` des brouillons au
  successeur). Les membres de ces salles restent les anciens jusqu'à la prochaine ouverture depuis la fiche ou
  le prochain changement de partie ; l'accès, lui, est juste tout de suite (la branche relit la politique du
  bail). Rien n'écrit `agent_id` ni `tenant_id` des baux en masse.
- **Rayon d'effet** : chaque `Lease::factory()->create()` crée désormais sa salle et ses membres. Cinq classes
  existantes comptaient les fils d'un bail ou d'un bailleur ; leurs assertions sont restreintes hors salle
  (marquées TCK-2960) et rejouées vertes (67 tests) : `ConversationTest` (3), `GroupConversationCreationTest`,
  `GroupeDeBailParticipantsTest`, `MembreSuspenduFilsDeContexteTest`, `ColonneDeBailleurAgentCreateurTest`. Deux
  confirmées rouges avant la retouche (assertion d'origine remise : `ConversationTest::…directe_existante…` et
  `ColonneDeBailleurAgentCreateurTest::…bailleur_bloque…`). Les autres classes qui créent des baux et lisent des
  fils ont été lues, pas jouées (règle de charge) : la CI de la PR tranche.

### Ablations (une à une, `--filter`, restauration par `cp` prouvée par md5)

| AC | Mutation | Résultat |
|---|---|---|
| AC1 | branche des parties de `LeaseObserver::updated` neutralisée | `changer_d_agent…` rouge |
| AC1 | `Customer::observe(SallesDeLaFicheClient)` retiré | `le_locataire_sans_compte_entre…` rouge |
| AC2 | `salleAllows` retiré de `branchesAllow` | `le_membre_qui_ne_lit_plus_le_bail…` rouge |
| AC2 | branche « salle » de `constrainListing` neutralisée | même test rouge (sur la liste) |
| AC3 | condition du contact actuel → `true` | `l_ancien_contact_perd_la_salle…` rouge |
| AC4 | liste explicite remplacée par « hors `ONGOING_STATUSES` » | `draft` et `pending_signature` rouges |
| AC5 | index `conversations_salle_unique` non créé | `l_index_tient_la_course…` rouge |
| — | `OpenBookingRoom` neutralisé | `la_reservation_demandee_a_sa_salle…` rouge |
| — | `trashed()` retiré d'`objetDeLaSalle` | `un_bail_supprime_rend_sa_salle_illisible` rouge |
| — | départ écrit en masse (hors modèle) | `SalleSignauxTest` (boîte de l'ancien agent) rouge |
| reach | exclusion des salles de `MessagingReach` retirée | `le_locataire_d_un_bail_fini_ne_joint_pas_l_agent…` rouge |
| 403 | `peutLire` retiré d'`OpenRoomRequest::authorize` | `un_inconnu_n_ouvre_pas_la_salle…` rouge (`403_pour_qui_ne_lit_pas` reste vert : le contrôleur refuse aussi — d'où le test qui part d'un bail SANS salle) |
| 403 | `allows` retiré du contrôleur | `403_pour_qui_lit_le_bail_sans_en_etre_partie` rouge |
| oracle | l'absent autorisé (`objet === null` → vrai) | `un_objet_absent_ou_supprime_recoit_le_refus_d_un_tiers` rouge |

### Non mesuré / laissé à la CI

- La suite entière : les classes qui créent des baux ou des réservations et comptent des fils, des
  correspondants ou des signaux (lues : `OwnerDepartedReachTest`, `MaintenanceThreadAccessTest`,
  `MessageInitialRegleDEcritureTest`, `MessagerieEnDirectTest`, `DirectConversationAddParticipantTest` — comptes
  relatifs ou fils filtrés, jugés sûrs ; les autres, non lues une à une).
- `EventListenerDuplicationTest` (écouteur neuf découvert) : non joué, règle de charge.
- Le « dernier échange » de `MessagingRelation::filsVisibles()` compte les salles (sans message, `last_message_at`
  nul) : effet sur l'étiquette du sélecteur non mesuré.
- Une salle ne suit pas un changement de `property_id` du bail (rare) : son contexte garde le bien d'origine.
- ⚠ **Salles vides en tête de la boîte** : la liste trie `orderByDesc('last_message_at')`, et PostgreSQL range
  les `NULL` EN PREMIER sous `DESC`. Une salle sans message (toutes, après `messaging:open-rooms`) passe donc
  devant les fils actifs — comme un groupe vide aujourd'hui, mais en nombre. Le « dernier échange » de
  `MessagingRelation` écrit déjà `NULLS LAST`. À trancher avec TCK-2963 (la liste n'est pas de ce ticket).
- `messaging:open-rooms` dans le conteneur `release` émet les signaux de chaque membre entré ; sans diffuseur
  joignable, le disjoncteur coupe après le premier échec, mais chaque signal abandonné s'ajoute au compteur
  `temps-reel:echecs:<jour>` (gonflé d'autant le jour du déploiement). `scripts/test-release-reindex.sh` : 32
  vérifications vertes avec la ligne neuve.
- Non relus pour le rayon d'effet : les baux créés par les fixtures de `tests/Support` (`FabriqueOccupation`,
  `LeaseDueFixture`, `ReferencePortfolio`) ou par des routes ; les épingles d'ordre des verrous
  (`OrdreDesVerrousDeLAcceptationTest` : `linkUser` finit désormais par une synchronisation de salle, après le
  COMMIT) ; les tests qui posent `TempsReel::fake()` AVANT de créer un bail ou une réservation et comptent les
  envois exacts.

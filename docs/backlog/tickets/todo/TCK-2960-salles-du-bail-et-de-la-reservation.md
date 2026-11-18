---
id: TCK-2960
title: "Les salles du bail et de la réservation : un fil unique par objet, des membres synchronisés sur les parties, une branche d'accès par sujet"
status: todo
phase: P1
family: back
estimate: L
wave: 94
created: 2026-11-17
updated: 2026-11-17
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

_(à remplir par implementing-specs)_

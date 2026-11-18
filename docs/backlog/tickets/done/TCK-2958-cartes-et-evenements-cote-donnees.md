---
id: TCK-2958
title: "Cartes et événements côté données : MessageType card/event, metadata fermé, relecture par lecteur, contenu en code neutre, avis d'intervention convertis"
status: done
phase: P1
family: full
estimate: L
wave: 94
created: 2026-11-17
updated: 2026-11-18
depends_on: [TCK-2957]
blocks: [TCK-2959, TCK-2961, TCK-2962, TCK-2964]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models:
    - docs/models-spec.md#20-message-
    - docs/models-spec.md#18-conversation-
    - docs/models-spec.md#21-maintenancerequest-
    - docs/models-spec.md#14-lease-
    - docs/models-spec.md#5-booking
tags: [back, front, messagerie, le-fil, cartes, i18n, securite, non-fuite, adr-0128]
---

## Objectif utilisateur

- **Tout participant d'un fil** : un objet posé ou un changement d'objet dans le fil lui montre ce
  que lui-même lit de cet objet ailleurs, jamais plus, et le texte d'un avis est écrit dans sa langue
  par le front, plus jamais en français par l'API.

## Contrat de données

- ADR-0128 § 3 (référence et code, jamais une copie ; relecture à l'affichage ; `content` et aperçu
  en code neutre) et « Conséquences » (chargement des objets d'une page en lot, par type).
- **Le `metadata` d'une carte ou d'un événement** a une seule forme :
  `{object: {type, id}, code, data}`. TCK-2959 y ajoute `action_for`, et rien d'autre ne s'y ajoute
  sans changer le test d'architecture.
- **Le catalogue des codes est fermé** (`App\Services\Messaging\CodesDuFil`) : pour chaque code, le
  type d'objet admis, la nature (`card` ou `event`) et **la liste des clés de `data` admises**.
  Ce ticket y pose les codes des avis d'intervention ; TCK-2961 et TCK-2964 y ajoutent les leurs.
- **`MessageResource`** rend, pour un message `card` ou `event`, une clé `object` :
  - lecteur qui lit l'objet : la **projection** de l'objet pour ce lecteur, avec ses `abilities` ;
  - sinon : `{indisponible: true}`, **sans aucune autre clé** (ni type, ni titre, ni identifiant
    au-delà de ce que `metadata.object` porte déjà).
- **Projection** : une liste déclarée de clés prise dans la ressource existante de l'objet,
  **résolue pour ce lecteur** (`MaintenanceRequestResource`, `LeaseResource` avec `viewer`,
  `BookingResource`). Elle est un sous-ensemble de ce que le `show` de l'objet rend au même lecteur.
  **Ce ticket pose toutes les projections du lot 1** :
  - les trois types sujets : `maintenance_request`, `lease`, `booking` ;
  - trois types d'objets de carte, non sujets de fil : `lease_payment` (lecture : `view` du bail de
    l'échéance, `LeasePaymentPolicy` n'ayant pas de `view`), `inventory` (`InventoryPolicy::view`),
    `property_visit` (`PropertyVisitPolicy::view`).
  Blocs `abilities` manquants, ajoutés aux mêmes clés que les existants : `BookingResource` (dérivé de
  `BookingPolicy` : `validate`, rejet, annulation) et `LeasePaymentResource` (payer : le locataire du
  bail, par `POST /api/payments/{paymentType}/{paymentId}/initiate` ; relancer :
  `LeasePaymentPolicy::remind` ; encaisser : `update`). `InventoryResource`, `PropertyVisitResource`,
  `LeaseResource` et `MaintenanceRequestResource` en ont déjà un.
- **Aucune projection ne porte de téléphone ni d'e-mail**, d'aucune partie : la carte n'en a pas
  besoin, et le fil est le moyen de joindre. C'est ce qui tient « le personnel ne lit jamais le contact
  du bailleur » dans le fil, alors que `LeaseResource` rend aujourd'hui ce téléphone au personnel de
  l'agence (TCK-2906, `computedAndParties`) : la projection exclut donc des clés que le `show`
  rend.
- **Le texte.** `content` d'un message `card`, `event` **et** `system` est un code neutre, et
  `conversations.last_message_preview` aussi. `ConversationResource.last_message.metadata` est rendu
  pour `system`, `event` et `card` (aujourd'hui : `system` seul), pour que le front compose l'aperçu.
- Front : consomme `type`, `metadata.code`, `metadata.data`, `object` de `GET
  /api/conversations/{conversation}/messages`, et `last_message` de `GET /api/conversations`.

## Direction UX / Artistique

- **Front, ce ticket seulement** : le texte d'un avis système et d'un avis d'intervention se compose
  depuis son code, pour la liste comme pour le fil, dans la langue du lecteur (next-intl `fr`/`en` ;
  `wo` porte le texte français tel quel, le wolof est en pause). Le rendu riche des cartes est
  TCK-2962 : ici, un message `event` s'affiche comme une ligne d'avis, et un message `card` comme une
  ligne neutre (« un objet a été partagé »), sans planter et sans montrer un code brut.

## Contraintes strictes (métier)

- **Non-fuite** : `data` ne porte que ce que **tout** participant peut lire. Jamais un montant, un
  coût, un prix, un téléphone, un e-mail ni une adresse. Ce qui dépend du lecteur passe par la
  projection, jamais par `data`, ni par `content`, ni par l'aperçu commun.
- **Écriture par un seul point** : `App\Services\Messaging\EvenementsDuFil` (ou nom équivalent) est le
  seul code qui crée un message `card` ou `event`. Il refuse (exception de logique) : un type hors
  registre, un code hors catalogue, un type d'objet qui ne va pas avec le code, une clé de `data`
  hors de la liste du code. Il pose `sender_id = null` pour un `event`, `content = code`.
- **Relecture en lot** : la ressource ne résout pas un objet par message. Sur le patron de
  `FaitsDesMessages` (calculé une fois par page), les objets d'une page sont chargés **en une requête
  par type**, avec les relations que leur projection demande.
- **Un message `event` est immuable** comme un `system` : `MessageObserver::updating` et `deleting`,
  `ConversationPolicy::modifyMessage`. Une `card` ne se modifie pas (édition refusée) ; sa
  suppression suit la règle d'un message de son auteur.
- **Compte des non-lus** : un message `event` ne compte **pour personne** dans ce ticket (`sender_id`
  nul : sans cette exclusion, chaque avis converti compterait comme non lu chez tous jusqu'à
  TCK-2959). Les deux définitions à toucher sont `$nonLus` (`ConversationController::index`) et sa
  copie de `markAsUnread` (l. ~534). Une `card` compte comme un message d'un autre.
- **Notifications** : `EvenementsDuFil` ne déclenche pas `NotifyNewMessageJob` ; l'objet prévient
  déjà par ses propres canaux. Une `card` posée par un participant (TCK-2964) suit le chemin
  ordinaire de `ConversationWriter`.
- **Recherche** : un message `card`, `event` ou `system` n'est plus indexé
  (`Message::shouldBeSearchable`) ; son `content` est un code. Les avis système déjà indexés avec
  leur texte français sont retirés de l'index (relever d'abord ce que fait la réimportation de
  `takussan-api/docker/release.sh` ; si elle ne retire pas un document devenu non indexable, une
  commande le fait). `SearchMessageController`, qui rend `MessageResource` sans faits, ne devient pas
  un second chemin de relecture.
- **La route d'envoi d'un participant ne change pas** : `SendMessageConversationRequest::PARTICIPANT_TYPES`
  n'admet ni `card` ni `event` (une carte se pose par la route de TCK-2964).
- **Liste des sites qui testent `MessageType::System`** (relevé du 2026-11-17, à tenir à jour) :
  `ConversationPolicy::modifyMessage`, `ConversationResource` (`last_message.metadata`),
  `ConversationController` (`$nonLus`, `markAsUnread`), `MessageObserver`, `MessagingReach`
  (`removedByAdmin`, qui lit `participant_removed` : ne change pas). Chacun décide explicitement de
  `card` et `event`.

## Delta à produire

- [ ] `App\Models\Enums\MessageType` : `Card = 'card'`, `Event = 'event'` (la colonne
  `messages.type` est un `string` sans contrainte : aucune migration de schéma).
- [ ] `App\Services\Messaging\CodesDuFil` : le catalogue fermé ; les codes des avis d'intervention,
  `maintenance.<cause>` pour chaque `MaintenanceStatusChanged::CAUSE_*`, avec leurs clés de `data`
  (`status`, `from`, `provider_name`, `actor_name` — des codes et des noms, aucun montant).
- [ ] `App\Services\Messaging\EvenementsDuFil` : `ecrire(Conversation, Model $objet, string $code,
  array $data = [])` pour un événement (et la méthode des cartes, utilisée par TCK-2964).
- [ ] `SujetsDuFil` (TCK-2957) : chaque type déclare sa projection (clés retenues, relations à
  charger) ; types `lease_payment`, `inventory`, `property_visit` ajoutés ; projections des six
  types, sans téléphone ni e-mail.
- [ ] `App\Services\Messaging\ObjetsDesMessages` (sur le patron de `FaitsDesMessages`) : charge en lot
  les objets d'une page, juge `view` pour le lecteur, rend projection ou `{indisponible: true}`.
  `MessageResource::page()` le reçoit ; `ConversationController::messages` le construit.
- [ ] `BookingResource` et `LeasePaymentResource` : bloc `abilities`.
- [ ] `SyncMaintenanceConversation` : l'avis d'étape passe par `EvenementsDuFil` (type `event`,
  objet = la demande) au lieu de `SystemMessageFactory::maintenance()`, qui est retiré avec
  `EVENT_MAINTENANCE`.
- [ ] `SystemMessageFactory::humanise` retiré : `content` d'un avis système = son code
  (`participant_added`…). `MessageObserver::created` écrit l'aperçu à partir de ce `content`.
- [ ] Migration de données `convert_maintenance_notices_to_events` (SQL pur, l'observateur refuse
  l'écriture d'un `system`) :
  - les messages `system` dont `metadata->>'event' = 'maintenance'` deviennent `event`, à la forme
    fermée (objet = `maintenance_request` de `metadata.maintenance_request_id`, sinon du fil ; code
    `maintenance.<cause>` ; `data` réduit aux clés du catalogue) ;
  - `content` de tout message `system` et `event` = son code ; `conversations.last_message_preview`
    réécrit depuis le dernier message quand celui-ci est `system` ou `event` ;
  - `down()` : rend leur type et leur forme aux avis convertis ; le texte français effacé ne revient
    pas (écrit dans l'en-tête de la migration) ;
  - la migration efface du texte : un fichier sous `docs/deploiement/actions/` (ADR-0127) demande la
    sauvegarde manuelle de la base avant le déploiement qui la joue.
- [ ] `$nonLus` et `markAsUnread` : `event` exclu ; `ConversationPolicy::modifyMessage`,
  `MessageObserver` (immutabilité de `event`) ; `Message::shouldBeSearchable` ;
  `ConversationResource.last_message.metadata` pour `system`, `event`, `card`.
- [ ] Front : le texte d'un avis (`system`, `event`) se compose depuis `metadata.event` /
  `metadata.code` ; **plus aucun repli sur `content` ni sur `last_message_preview`** (un code inconnu
  rend un libellé générique, jamais le code) ; les types `card` et `event` sont connus du typage
  des messages ; clés i18n `fr`, `en`, et `wo` = texte français.
- [ ] Tests API :
  - `CodesDuFilArchitectureTest` — parcourt **tout** le catalogue : aucune clé de `data` ne
    correspond à un motif interdit (`amount`, `montant`, `cost`, `cout`, `price`, `prix`, `phone`,
    `telephone`, `email`, `address`, `adresse`, `street`, `rue`), et la forme de `metadata` est
    exactement `{object, code, data}` ;
  - `EvenementsDuFilTest` — refus d'un type hors registre, d'un code hors catalogue, d'un type
    d'objet qui ne va pas avec le code, d'une clé de `data` en trop ;
  - `RelectureDesObjetsTest` — **un jeu de données par type du registre** : un non-lecteur reçoit
    `{indisponible: true}` et rien d'autre ; pour chaque lecteur type (locataire demandeur,
    prestataire assigné, bailleur, personnel), les clés de la projection ⊆ celles du `show` de
    l'objet pour ce même lecteur ; le locataire demandeur ne reçoit aucune clé `quote_*`,
    `estimated_cost`, `actual_cost` ; **aucune projection, pour aucun lecteur, ne contient une clé
    `phone` ou `email` à quelque profondeur que ce soit** (le personnel de l'agence lisant un bail
    compris) ;
  - nombre de requêtes de `GET …/messages` égal pour une page de 1 et de 10 événements d'un même type ;
  - `SyncMaintenanceConversationTest` — l'avis d'étape est un `event` au code attendu, `content` =
    le code ; `ConvertMaintenanceNoticesMigrationTest` ;
  - non-lus : un `event` ne compte pas, un `card` d'un autre compte.
- [ ] Tests front : le texte d'un avis d'intervention et d'un avis système, dans le fil et dans
  l'aperçu de la liste, depuis le code ; un code inconnu ne montre jamais le code brut.

## Critères d'acceptation

- [ ] **AC1** — Un lecteur qui ne lit pas l'objet reçoit `object: {indisponible: true}` sans autre
  clé, pour **chaque** type du registre. *Ablation : remplacer le jugement `view` par `true` dans
  `ObjetsDesMessages` rend rouge chaque ligne du jeu de données.*
- [ ] **AC2** — Le locataire demandeur ne lit jamais un coût ni un devis dans la projection d'une
  intervention. *Ablation : projeter la ressource résolue pour le personnel au lieu du lecteur rend
  ce test rouge* (un test qui ne regarde que l'absence de `object` ne le serait pas).
- [ ] **AC3** — Pour chaque type et chaque lecteur type, les clés de la projection sont un
  sous-ensemble des clés du `show` de l'objet pour ce lecteur.
- [ ] **AC3 bis** — Le personnel de l'agence ne lit le téléphone du bailleur dans aucune carte de bail
  ni d'intervention, ni aucun lecteur aucun téléphone ou e-mail dans aucune projection. *Ablation :
  projeter `landlord` tel que `LeaseResource` le rend rend ce test rouge pour le lecteur
  « personnel ».*
- [ ] **AC4** — Le test d'architecture parcourt le catalogue entier. *Ablation : ajouter `amount` aux
  clés d'un code le rend rouge ; écrire un `event` dont `data` porte `amount` est refusé par
  `EvenementsDuFil`.*
- [ ] **AC5** — Le nombre de requêtes de la page de messages ne croît pas avec le nombre de cartes
  d'un même type (1 contre 10).
- [ ] **AC6** — Après la migration et après un nouvel avis, aucun `content` de message `system` ou
  `event` n'est en français, ni aucun `last_message_preview` d'un fil dont le dernier message est
  `system` ou `event` ; `SystemMessageFactory::humanise` n'existe plus.
- [ ] **AC7** — Un avis d'intervention converti ne compte pas comme non lu. *Ablation : retirer
  l'exclusion de `event` de `$nonLus` rend rouge le test de la liste ; la retirer de `markAsUnread`
  rend rouge le sien.*
- [ ] **AC8** — Côté front, l'avis d'intervention et l'aperçu de la liste s'écrivent dans la langue
  du lecteur depuis le code, et un code inconnu n'affiche jamais le code.
- [ ] Pint propre ; ESLint 0 erreur ; `tsc --noEmit` propre ; tests des fichiers touchés verts.

## Hors périmètre

- `action_for` et le compte d'un événement pour qui doit agir : TCK-2959.
- Les événements des baux, paiements, états des lieux, visites, réservations : TCK-2961.
- Le rendu des cartes à l'écran (fil-cartes D) : TCK-2962. Poser une carte : TCK-2964.
- La recherche dans le texte d'une carte (une carte n'a pas de texte à elle).
- Le signal temps réel d'une carte mise à jour : TCK-2955 (lot 0) et TCK-2962.

## Notes d'implémentation

### Re-mesure (2026-11-18, arbre `feat/le-fil`, après TCK-2957)

- **« encaisser : `update` »** : la route `POST lease-payments/{payment}/mark-paid` juge
  `LeasePolicy::recordPayment` sur le BAIL (`MarkPaidLeasePaymentRequest::authorize`), pas
  `LeasePaymentPolicy::update`, qui admet aussi le locataire (il aurait reçu un bouton refusé en 403).
  `abilities.record_payment` suit la route.
- **« payer »** : `initiate` juge `LeasePaymentPolicy::update` (personnel, bailleur, locataire) ; le
  ticket le réserve au locataire : `abilities.pay` = compte du locataire du bail ET `update` ET un reste dû.
- **`lease_payment` n'a pas de `show`** : la référence d'AC3 est la ligne de ce paiement dans
  `GET /api/leases/{lease}/payments` pour le même lecteur.
- **`BasePolicy::view` refuse un `LeasePayment`** (aucune capacité de lecture : super-admin seul) :
  le registre lit `view` sur le bail de l'échéance (`via: lease`).
- **`MaintenanceRequestResource` et `PropertyVisitResource` ne rendent `abilities` que sur LEUR route**
  (`isDetailRequest`) : sur `GET …/messages`, la clé est absente. Une option `avecGestes()` les rend
  hors de la route, `abilities` seul (pas le détail entier : médias, fil, créneau, concurrence).
- `maintenance.system.*` et `maintenance.status.*` (`lang/{fr,en,wo}/maintenance.php`) n'avaient
  pour seul lecteur que `SystemMessageFactory::humanise` : retirés avec lui, et la ligne
  `maintenance.status` de `LabelKeysCoverValuesTest`.
- `EcritureDeMessageUniqueTest` (TCK-2782) ferme la liste des écrivains de `Message` : `EvenementsDuFil`
  y entre (un `event` n'a pas d'auteur ; ses cartes passent par `ConversationWriter`).
- `SyncMaintenanceConversationTest` n'existe pas (déjà relevé par TCK-2957) : c'est
  `tests/Feature/Maintenance/MaintenanceConversationTest.php` qui porte l'avis d'étape.


### Choix et mesures (2026-11-18)

- **Migration** `2026_11_18_295801_convert_maintenance_notices_to_events` (SQL pur) : l'objet est
  `metadata.maintenance_request_id` s'il est numérique, sinon le sujet du fil (TCK-2957), sinon
  `conversations.maintenance_request_id`, sinon `id` nul (la carte se relit « indisponible ») ; une
  cause absente ou hors des 14 `CAUSE_*` du jour devient `maintenance.transition`. `data` réduit aux
  quatre clés du catalogue : `actor_id` est perdu, et `down()` le rend nul. Rejouée, elle ne change rien
  (testé). `ConvertMaintenanceNoticesMigrationTest` couvre les lignes bizarres (cause inconnue, id non
  numérique, fil sans demande, message supprimé, avis sans `metadata`).
- **Index de recherche** : `Message::shouldBeSearchable` refuse `system`/`event`/`card`, mais
  `scout:import` filtre sans retirer, et `release.sh` ne réimporte que sur un écart de forme. D'où la
  commande `messages:unindex-coded` (idempotente, synchrone), prouvée contre Meilisearch réel
  (`tests/Feature/Search/MessagesUnindexCodedTest.php`, témoin : avant elle, la recherche rend encore
  les avis). L'action `docs/deploiement/actions/2026-11-18-sauvegarder-avant-la-conversion-des-avis.md`
  demande la sauvegarde manuelle AVANT, puis la commande APRÈS (garde `check-actions-de-deploiement` verte).
- **Gestes de `booking` et `lease_payment`** : `BookingResource` et `LeasePaymentResource` n'avaient pas
  d'`abilities` ; ajoutés sur demande (`avecGestes($lecteur)`), rendus par le `show` de la réservation
  et l'échéancier du bail (référence d'AC3). `cancel` d'une réservation suit `BookingService::cancel`
  (séjour confirmé commencé : non, TCK-1301) — `BookingGestesDuLecteurTest`.
- **`DateInventoryByValueTest`** : trois clés que le parcours n'atteint pas inscrites avec leur raison
  (`BookingResource::abilities`, `LeasePaymentResource::abilities`, `MessageResource::object`).
- **AC5.** Dix événements sur la MÊME demande coûtent autant qu'un. Sur dix demandes DISTINCTES, le
  premier relevé croissait : **40 requêtes pour 1, 238 pour 10** (2026-11-18, `load average` ~2) —
  tracé par pile d'appels : `MaintenanceRequestPolicy` → `User::staffAgencyId()` →
  `MembershipCapabilityResolver::isStaffAt()`, ~17 `exists(agent_profiles…)` par demande, et une
  requête de médias par demande (`has_voice_note`). Corrigé par le chargement groupé que le résolveur
  documente déjà (`MembershipCapabilityResolver::primed()`, pour la page : le lecteur × les agences des
  objets, de leur bien, de leur bail et de son profil actif — pas une mémoïsation de verdict, TCK-457)
  et `media` au chargement des demandes : **21 et 21**. Les deux tests d'AC5 sont des égalités strictes ;
  ablations : sans l'amorce, rouge ; sans `media`, rouge.
- **Route d'envoi** : `SendMessageConversationRequest::PARTICIPANT_TYPES` n'admet ni `card` ni `event`
  (inchangé) ; épinglé par `EvenementsDuFilTest::test_la_route_d_envoi_refuse_une_carte_et_un_evenement`
  (422 sur `type`, témoin : un texte passe en 201). Les autres lectures de `system` dans `app/`
  (`MessagingReach::removedByAdmin`, `Message::neutralPreview`) ne concernent pas `card`/`event` ; tout
  compte de non-lus passe par `$nonLus` (liste, `unread_total`, `meta.counts`, `filter[unread]`).
- **Front** : `useTexteMessageSysteme` rend toujours une chaîne (code inconnu → `messaging.system.inconnu`),
  jamais `content` ni `last_message_preview` ; `event` passe par la ligne d'avis, `card` par une ligne
  neutre (`messaging.chat.carteNeutre`, aperçu `messaging.list.apercu.card`) ; `ReponseRecue` ne cite
  ni `event` ni `card`. La forme `event: 'maintenance'` d'avant quitte le typage (plus émise).
- `npx tsc --noEmit` : quatre erreurs `Cannot find module 'tesseract.js'`
  (`src/lib/documents/lecture-mrz/moteur.ts`, c4c023396) — dépendance déclarée et absente du
  `node_modules` local, hors de ce ticket ; aucune autre erreur.

### Ablations (une à la fois, restauration prouvée par md5)

| AC | Mutation | Résultat |
|---|---|---|
| AC1 | `SujetsDuFil::peutLire` → `true` dans `ObjetsDesMessages` | 6/6 lignes du jeu de données rouges |
| AC2 | `MaintenanceRequestResource::seesQuote` → `true` | `le_locataire_demandeur_ne_lit_ni_devis_ni_cout` rouge |
| AC3 bis | projeter `landlord` entier (bail) | ligne `lease` du jeu de données + témoin du téléphone rouges |
| AC4 | `amount` ajouté à `DONNEES_INTERVENTION` | `CodesDuFilArchitectureTest` rouge (et `EvenementsDuFil` refuse `amount` : jeu `montant dans data`) |
| AC5 | `media` retiré du chargement des demandes | `dix_objets_d_un_meme_type_se_chargent_en_une_requete` rouge |
| AC5 | amorce `primed()` vidée (aucun utilisateur) | `dix_objets_d_un_meme_type_se_chargent_en_une_requete` rouge |
| AC7 | `Event` retiré de l'exclusion de `$nonLus` | 2 tests de la liste rouges |
| AC7 | `Event` retiré de l'exclusion de `markAsUnread` | `marquer_non_lu_ignore_l_evenement` rouge |
| AC8 | repli du texte sur `meta.code` (front) | 3 tests vitest rouges (bulle et liste) |

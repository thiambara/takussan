---
id: TCK-2965
title: "La note d'équipe côté données : messages.visibility, un filtre dans ConversationAccess, une matrice de non-fuite par chemin de lecture"
status: done
phase: P2
family: back
estimate: L
wave: 95
created: 2026-11-18
updated: 2026-11-18
depends_on: []
blocks: [TCK-2966, TCK-2967, TCK-2968]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models:
    - docs/models-spec.md#20-message-
    - docs/models-spec.md#18-conversation-
    - docs/models-spec.md#19-conversationparticipant-
tags: [back, messagerie, le-fil, note-d-equipe, securite, non-fuite, adr-0128]
---

## Objectif utilisateur

- **Le personnel de l'agence** : dans le fil d'un client, il écrit à ses collègues une « Note d'équipe »
  que le client ne lit jamais, sans quitter le fil ni ouvrir un groupe à part.
- **Le client (locataire, bailleur, candidat, prestataire)** : rien ne lui laisse deviner qu'une note
  existe. Il ne la voit pas, ni ne la compte, ni ne la retrouve, ni n'en est prévenu.

## Contrat de données

- ADR-0128 § 6 (la règle, la liste des chemins fermés, le filtre **dans** `ConversationAccess`) et
  « Application » (la matrice de non-fuite, vérifiée par ablation).
- **`messages.visibility`** : chaîne `all` (défaut, `NOT NULL`) ou `team`, et une enum
  `App\Models\Enums\MessageVisibility`. Les messages existants valent `all`.
- **L'agence du fil** se lit en un point : `App\Services\Messaging\EquipeDuFil::agence(Conversation)`.
  On prend l'agence du sujet (`SujetsDuFil`), sinon celle du bien du fil, sinon celle de son bail.
  Sans agence, aucune note d'équipe n'est possible dans ce fil.
- **Lire une note d'équipe** demande deux conditions, jugées **à la lecture**, jamais à l'écriture :
  - être participant actif du fil (`left_at` nul) ;
  - être personnel actif de cette agence (`PersonnelDeLAgence::personnelActifDe`).

  Un agent qui quitte l'agence ne lit plus les notes, même les siennes.
- **Le super-admin hors impersonation lit aussi les notes d'équipe** (décision du porteur du
  2026-11-18, 3b, sur le précédent du document interne de la fiche client, ADR-0099). C'est
  l'exception à la règle « les participants seulement » d'ADR-0128 § 6, amendé. Sous impersonation,
  il lit ce que lit la cible, et rien de plus : un opérateur qui se présente comme le locataire ne
  voit aucune note.
- **L'écriture** passe par la route existante `POST /api/conversations/{conversation}/messages`, avec
  un champ `visibility` (`all` par défaut). `team` est refusé en 422, avec un code d'erreur sous
  `LangGroupParity`, quand :
  - l'auteur n'est pas personnel actif de l'agence du fil ;
  - le fil n'a pas d'agence ;
  - le type n'est pas `text`, `voice` ou `attachment` : ni `card`, ni `event`, ni `system`.
- **`MessageResource`** rend `visibility` sur chaque message.
- **Le point de filtre unique** : `ConversationAccess::messagesLisiblesPar(User, Builder|Relation)`
  (nom à garder ou équivalent). Il ajoute `visibility = all OR <le lecteur lit les notes de ce fil>`.
  Tout chemin qui lit des messages passe par lui, à commencer par les deux formes de
  `ConversationController::messages`.

## Contraintes strictes (métier)

- **Chaque chemin de lecture reçoit un test, et chacun doit rougir par ablation** quand on retire le
  filtre de son chemin. Liste relevée le 2026-11-18, à compléter si l'implémentation en trouve un
  autre :
  1. `GET …/messages`, en page (`before_id`) et en suite (`after_id`) ;
  2. `GET /api/conversations`, sur trois points :
     - `last_message` et `last_message_preview` ;
     - `unread_count`, `meta.unread_total` et `meta.counts.unread` (`NonLus::comptentPour` et
       `$nonLus`) ;
     - le tri `LastExchangeSort` ;
  3. `GET /api/conversations/{conversation}`, et `markAsUnread`, qui recule sur le dernier message
     **lisible** ;
  4. `GET /api/search/messages` : le document Meilisearch porte `visibility`, l'attribut est filtrable
     (`search:sync-index-settings`), et `MessageSearchService` filtre
     `visibility = all OR conversation_id IN <fils dont le lecteur lit les notes>` **dans le moteur**,
     jamais sur la page rendue ;
  5. `NotifyNewMessageJob` : une note ne notifie que les destinataires qui la lisent, par tous les
     canaux de `NotificationService` (application, courriel, WhatsApp, SMS) ;
  6. le temps réel (`Message::signauxTempsReel`, TCK-2955) : une note n'émet **rien** sur
     `sujet.conversation.{id}`, que tout abonné du fil reçoit. Elle émet seulement vers
     `utilisateur.{id}` de ceux qui la lisent ;
  7. les accusés (`FaitsDesMessages`) : aucun fait n'est calculé sur une note pour un lecteur qui ne
     la lit pas ;
  8. `DataExportBuilder` : l'export d'un client ne porte aucune note d'équipe. Celui d'un membre du
     personnel porte les siennes ;
  9. toute route qui reçoit un identifiant de message (modification, suppression, signalement,
     pièce jointe ou média, s'il en existe) répond comme pour un message inexistant à qui ne lit pas
     la note.
- **Une note ne touche jamais l'aperçu commun** : `MessageObserver::created` ne met à jour ni
  `last_message_id`, ni `last_message_preview`, ni `last_message_at` pour un message `team`.
- **Une note ne passe jamais par `EvenementsDuFil`** : un événement ou une carte est toujours `all`.
- **`GET …/messages` garde sa pagination** : un message `team` sauté chez un client ne crée ni page
  courte trompeuse ni `has_more` faux. Le filtre est dans la requête SQL, pas dans la collection.

## Delta à produire

- [x] Migration `add_visibility_to_messages` : `string('visibility')->default('all')`, plus un index
  qui sert le filtre de la page (`(conversation_id, visibility, id)` ou ce que la mesure justifie) ;
  `down()` retire l'index puis la colonne.
- [x] `MessageVisibility` (enum), son cast dans `Message` et `fillable`.
- [x] `EquipeDuFil` : `agence(Conversation)` et `litLesNotes(User, Conversation)`.
- [x] `ConversationAccess::messagesLisiblesPar`, branché sur tous les chemins de la liste.
- [x] `SendMessageConversationRequest` et `ConversationWriter` : champ `visibility`, refus en 422.
- [x] `Message::toSearchableArray` (`visibility`), `config/scout.php` (filtrable),
  `MessageSearchService`.
- [x] `MessageObserver::created`, `NotifyNewMessageJob`, `Message::signauxTempsReel`,
  `FaitsDesMessages`, `DataExportBuilder`.
- [x] `MessageResource` : `visibility`.
- [x] `docs/deploiement/actions/` : la réimportation de l'index des messages porte la nouvelle clé.
  Relire d'abord `takussan-api/docker/release.sh`, qui la joue peut-être déjà ; si c'est le cas,
  aucun fichier n'est à créer.
- [x] Tests :
  - `NoteDEquipeNonFuiteTest` : **un test par chemin de la liste**, avec trois lecteurs (le locataire
    participant, le bailleur participant, un agent d'une autre agence participant d'un groupe) et un
    lecteur témoin (le personnel actif, qui lit la note) ;
  - `NoteDEquipeEcritureTest` : les refus en 422 ;
  - l'agent sorti de l'agence ne lit plus ;
  - l'aperçu commun ne bouge pas ;
  - la pagination tient avec 30 notes entre deux messages `all`.

## Critères d'acceptation

- [x] **AC1** — Pour **chaque** chemin de la liste, un lecteur qui n'est pas personnel actif de
  l'agence du fil ne reçoit ni la note, ni son texte, ni son compte, ni sa notification, ni son
  signal. Le personnel actif la reçoit. *Ablation : retirer le filtre d'un chemin, l'un après
  l'autre, rend rouge le test de ce chemin, et celui-là seulement.*
- [x] **AC2** — La recherche filtre dans Meilisearch : une recherche du texte exact de la note, par le
  locataire, rend `total = 0`. *Ablation : filtrer après la pagination laisse `total = 1`, et le test
  doit le voir.*
- [x] **AC3** — Après une note, `last_message_preview`, `last_message_at` et l'ordre de la liste sont
  ceux d'avant, pour tous les lecteurs.
- [x] **AC4** — Une note émet un signal vers le seul `utilisateur.{id}` du personnel qui la lit, et
  aucun sur `sujet.conversation.{id}` (`FauxTransport`). *Ablation : émettre sur le canal du sujet
  rend ce test rouge.*
- [x] **AC5** — `visibility = team` est refusé en 422 pour un client, pour un agent d'une autre agence,
  dans un fil sans agence, et pour un type autre que `text`, `voice` ou `attachment`.
- [x] **AC6** — Un agent devenu inactif dans l'agence ne lit plus les notes du fil, ni les siennes.
- [x] **AC6 bis** — Le super-admin hors impersonation lit la note par `GET …/messages` et par la
  recherche. Sous l'impersonation du locataire, il ne la lit par aucun chemin. *Ablation : juger
  l'opérateur au lieu de la cible pendant l'impersonation rend ce test rouge.*
- [x] **AC7** — Avec 30 notes entre deux messages, le locataire lit les deux messages en pages de
  20, sans page vide ni `has_more` faux.
- [x] Pint propre ; tests des fichiers touchés verts.

## Hors périmètre

- L'écran de la note, son interrupteur dans le composeur et son style : TCK-2968.
- Les @mentions : TCK-2966.
- Le pont WhatsApp ou SMS et le copilote, qui n'existent pas encore. Leurs lots respectent ce filtre.
- Convertir une note en message `all`, ou l'inverse : une note reste une note.

## Notes d'implémentation

### Re-mesure de la prémisse (2026-11-18)

- **Types** : le dépôt n'a ni `voice` ni `attachment`. Les types d'une note sont `text`, `audio`, `image`
  et `document` (`MessageVisibility::typesDeNote()`). La route n'accepte déjà que ces quatre
  (`SendMessageConversationRequest::PARTICIPANT_TYPES`) : le refus `messaging.team_note_type` vit dans
  `ConversationWriter`, le point d'écriture, et s'éprouve en l'appelant avec `card`, `event`, `system`.
- **`ConversationWriter::post` écrit lui-même `last_message_*`**, après l'observateur : garder le seul
  `MessageObserver::created` aurait laissé l'aperçu bouger par la route. Les deux se gardent, chacun
  éprouvé par son test (2a par la route, 2a bis par `Message::create`).
- **Chemin de plus** : `ConversationWriter` désarchive le fil chez tous les autres participants. Une note
  ne désarchive que chez ceux qui la lisent (test 2c).
- **Chemin 9** : aucune route ne reçoit un identifiant de message (ni modification, ni suppression, ni
  signalement par message — `ConversationReportController` signale le fil ; les pièces sortent par URL
  signée, dans la seule page filtrée). Un test recense les routes à paramètre `{message}` et rougit si
  une apparaît.
- **`LastExchangeSort`** et le tri de la liste lisent `conversations.last_message_at`, qu'une note ne
  touche plus : ils sont gardés par la même garde que l'aperçu (test 2a, qui vérifie l'ordre).
- **`maintenance_requests` n'a pas d'`agency_id`** : l'agence d'une demande se lit par son bien, sinon
  son bail.
- **Deux prédicats du personnel** : le LECTEUR (appelant HTTP) est jugé par `personnelActifDe` (profil
  actif), comme le ticket le dit ; un TIERS (destinataire d'une notification, d'un signal temps réel,
  accusé de lecture) par `estPersonnel` — dans un job ou un événement de modèle, le profil actif serait
  celui de l'auteur ou de personne.
- **Impersonation** : le jeton appartient à la cible (`ImpersonationService::start()`), donc
  `$request->user()` est la cible, qui n'est jamais super-admin (`impersonation.target_operator`). Aucun
  code propre à l'impersonation n'est ajouté ; l'ablation substitue l'opérateur.
- **Recherche du super-admin** : elle reste bornée aux fils où il participe (`participatingQuery`) ; le
  test AC6 bis de la recherche l'y ajoute.
- **Export** : la requête d'origine avait un `orWhere` au premier niveau ; elle est groupée, puis
  restreinte par `ConversationAccess::messagesExportablesDe` (`all`, ou l'auteur est le titulaire).
- **Déploiement** : `.search-shape` (Dockerfile) hache `config/scout.php` et tout modèle à
  `toSearchableArray` ; `docker/release.sh` réimporte donc tous les index au déploiement. Aucun fichier
  sous `docs/deploiement/actions/`. Un document indexé avant la clé n'a pas de `visibility` et ne passe par
  aucune branche du filtre (fermé par défaut) jusqu'à cette réimportation.
- **Accusés** : sur une note, `read_count` ne compte que les lecteurs de notes, et `read_by_recipient`
  vaut `null` dans une directe dont l'autre ne lit pas la note.
- **Index** : `messages_conversation_visibility_idx (conversation_id, visibility, id)`, à côté de
  `(conversation_id, created_at)` qui existait. Non mesuré par `EXPLAIN` sur un volume réel.


### Écarts mesurés pendant l'implémentation

- **AC2, le témoin du total** : Scout recompte `meta.total` en SQL dès qu'une requête `query()` est posée
  (`Laravel\Scout\Builder::getTotalCount`). Le filtre du moteur retiré, la défense SQL laisse donc
  `total = 0` sur la recherche du texte exact : l'ablation « filtrer après la pagination » ne se voit pas
  au total. Elle se voit à la PAGE : 25 notes plus récentes que l'unique message pour tous, page de 20,
  la première page du locataire devient vide (test `chemin_4_bis`, rouge sous l'ablation). Le total à 0
  reste asserté (chemin 4).
- **Moteur `collection`** : avec une fonction de rappel, Scout ne pose plus aucune clause du builder
  (`CollectionEngine::searchModels`) ; `MessageSearchTest` et `MessageSearchExistenceOracleTest`
  rougissaient. Le rappel rejoue les clauses en SQL, comme `DocumentSearchService::restreindreEnSql`.
- **La règle SQL de la recherche** (`query()`) est la seule règle des moteurs `collection` et `database`
  (Scout l'applique à l'hydratation, `queryScoutModelsByIds`, et au recompte du total), et la défense
  d'un index en retard sur la base. Deux tests la tiennent : `chemin_4_ter` (un message indexé `all`
  devenu `team` par `DB::table()->update`) et `chemin_4_quater` (moteur `collection`).
- **Export et AC6** : l'archive d'un agent parti porte encore ses propres notes (règle d'auteur, chemin 8),
  alors qu'il ne les lit plus dans le fil. Lecture retenue : une archive porte ce qu'on a écrit. À trancher
  par la session si l'on veut l'inverse.
- **Charge** : au-delà des trois classes neuves et des gardes du brief, ~45 classes voisines (messagerie,
  recherche, export, temps réel) ont été jouées par chemin explicite, en séries de 15, charge < 3 : c'est
  ce qui a trouvé la régression du moteur `collection`.
- **Chemin 5 et temps réel** : l'ablation du filtre des notifications rougit aussi le test du temps réel —
  la notification de la note partait vers `utilisateur.{id}` du locataire.

### Ablations (2026-11-18, une à une, restauration par `cp`, md5 identique à l'original à chaque fois)

| Ablation | Rouges |
|---|---|
| filtre de la page (`before_id`) | 1a, AC6, AC6 bis, AC7 |
| filtre de la suite (`after_id`) | 1b |
| filtre de `$nonLus` | 2b, AC6 bis |
| filtre de `markAsUnread` | 3b |
| garde de l'aperçu dans `ConversationWriter` | 2a, 3a |
| garde de l'aperçu dans `MessageObserver` | 2a bis, 2a, 3a |
| désarchivage restreint aux lecteurs | 2c |
| filtre de `NotifyNewMessageJob` | 5, 6 |
| note émise sur `sujet.conversation.{id}` | 6 |
| boîtes de tous les participants pour une note | 6 |
| accusés comptant tous les participants | 7 |
| export sans `messagesExportablesDe` | 8 |
| filtre du moteur de recherche | 4 bis |
| règle SQL `query()` de la recherche | 4 ter (index en retard), 4 quater (moteur `collection`) |
| accusé `null` d'une note dans une directe | 7 bis |
| personne ne lit plus les notes (témoins) | AC6 (témoin), AC7, 1a, 1b, 3b, 7, 7 bis |
| impersonation jugée sur l'opérateur (page, liste) | AC6 bis |
| impersonation jugée sur l'opérateur (recherche) | AC6 bis (recherche) |
| l'auteur lit ses propres notes | AC6 |
| refus « hors personnel » retiré | 3 cas de l'écriture |
| refus « sans agence » retiré | fil sans agence |
| refus « type » retiré | `card`, `event`, `system` |

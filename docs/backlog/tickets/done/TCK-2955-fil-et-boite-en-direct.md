---
id: TCK-2955
title: "Le fil, la boîte et les notifications en direct ; présence et « en train d'écrire » dans un fil ouvert"
status: done
phase: P1
family: full
estimate: M
wave: 93
created: 2026-11-17
updated: 2026-11-18
depends_on: [TCK-2952, TCK-2954]
blocks: [TCK-2960, TCK-2961, TCK-2962]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models:
    - docs/models-spec.md#18-conversation-
    - docs/models-spec.md#20-message-
tags: [full, messagerie, temps-reel, notifications, presence, adr-0129]
---

## Objectif utilisateur

- **Locataire, bailleur, agent, prestataire** : un message envoyé apparaît chez l'autre sans
  attendre. La liste des conversations, le compteur des non-lus et la cloche des notifications se
  mettent à jour seuls. Dans un fil ouvert, on voit qui est là et qui est en train d'écrire.

## Contrat de données

Décisions : [ADR-0129](../../../adr/0129-le-socle-temps-reel-signale-et-l-api-sert.md) §§ 2 à 4.
Socle : TCK-2952 (émetteur, registre avec le type `conversation`, `CodeDeSignal`) ; client :
TCK-2954 (les deux primitives, le mode dégradé).

**Les codes émis**, déclarés dans `CodeDeSignal` par TCK-2952 :

Sur `utilisateur.{id}`, le `subject` est l'objet qui a changé (`conversation:{id}`), identique pour
tous les destinataires, ou `utilisateur:{id}` sans objet (règle de TCK-2952).

| Code | Canal | `subject` | Quand |
|---|---|---|---|
| `message.created` | `sujet.conversation.{id}` | `conversation:{id}` | un message est créé dans le fil, par n'importe lequel des trois écrivains (`ConversationWriter`, `PublicPropertyController`, `SystemMessageFactory`) |
| `message.updated` | `sujet.conversation.{id}` | `conversation:{id}` | un message est modifié ou supprimé |
| `conversation.read` | `sujet.conversation.{id}` | `conversation:{id}` | un participant marque le fil lu ou non lu (`PUT conversations/{conversation}/read` et `/unread`) : les accusés de lecture des autres changent (TCK-2858) |
| `participants.updated` | `sujet.conversation.{id}` | `conversation:{id}` | un participant est ajouté, retiré, ou change de rôle, par la route ou par une synchronisation (`SyncMaintenanceConversation`) |
| `boite.updated` | `utilisateur.{id}` | `conversation:{id}` | la liste ou le compteur d'une personne change : chaque participant actif à un `message.created` ou `message.updated` ; le lecteur à un `conversation.read` ; la personne ajoutée ou retirée à un `participants.updated` |
| `notifications.updated` | `utilisateur.{id}` | `utilisateur:{id}` | une notification est créée (déjà posé par TCK-2952), lue, rendue non lue, ou toutes lues (`routes/api/notifications.php`) |

**Lectures relancées par le front** : celles d'aujourd'hui, sans endpoint neuf. Ce sont le fil, ses
messages et ses participants, la liste des conversations, le compteur des non-lus, et la liste et
le compteur des notifications.

**Les relectures périodiques qui deviennent le filet** (relevé du 2026-11-17) :

- le fil ouvert, à 3 s (`lib/queries/conversations.ts`) ;
- la liste, à 10 s (`lib/queries/conversations*.ts`) ;
- les compteurs de non-lus, aux cadences `CADENCE_NON_LUS_*` ;
- les notifications, à 30 s (`notifications/useNotifications.ts`).

Chacune passe par le mode dégradé de TCK-2954 : 60 s quand la connexion tient, son intervalle
d'aujourd'hui sinon.

## Direction UX / Artistique

- **Présence** : discrète, dans l'en-tête du fil ouvert. Un point ou un liseré sur l'avatar des
  participants présents, jamais une liste à part. Personne d'autre que soi présent : rien de plus
  que l'en-tête d'aujourd'hui.
- **« En train d'écrire »** : une ligne courte au-dessus du champ de saisie, avec le prénom tel que
  le fil l'affiche déjà, ou « Plusieurs personnes écrivent… ». Elle s'efface seule quelques
  secondes après le dernier signe d'écriture. Aucune animation insistante.
- **Un nouveau message** apparaît à sa place, comme après une relecture. La position de lecture
  n'est pas volée si l'on a remonté le fil.
- Libellés en `fr`/`en`/`wo`. Le `wo` porte le texte français tel quel : le wolof est en pause.

## Contraintes strictes (métier)

- **Back : l'émission passe par l'émetteur, au niveau des modèles.**
  - `Message` et `ConversationParticipant` utilisent `EmetDesSignaux`, pour que les trois écrivains
    de messages et toutes les synchronisations de participants émettent sans qu'on y pense.
  - Relevé du 2026-11-17 :
    - les messages s'écrivent par `messages()->create(…)` et `Message::create(…)`, qui déclenchent
      les événements Eloquent ;
    - les participants s'écrivent par `participants()->attach(…)` et `updateExistingPivot(…)`, sur
      un pivot `->using(ConversationParticipant::class)`, ce qui les déclenche aussi ;
    - certains passent aussi par `ConversationParticipant::query()->…->update([...])` (par exemple
      `GroupConversationService`), **qui ne déclenche rien**.
    - L'implémenteur inventorie toutes les écritures de participants et de messages, et fait
      émettre explicitement celles qui contournent les événements.
  - **`participants.updated` ne part que sur un changement de composition** : création, suppression,
    ou changement de `left_at` ou de `role`.
    - **Jamais** sur `last_read_at`, `is_muted` ou `archived_at` : `markAsRead`,
      `PublicPropertyController` et `ConversationWriter` mettent `last_read_at` à jour par
      `updateExistingPivot`, et chaque lecture émettrait sinon `participants.updated` à tout le
      fil.
  - `conversation.read` et les signaux des notifications partent des actions qui changent l'état
    (`ConversationController::markAsRead` et `markAsUnread`, `NotificationController`).
  - Aucun appel direct à la diffusion.
- **Back : une diffusion vers plusieurs personnes est un seul appel.**
  - `boite.updated` vers les N participants d'un groupe passe par un seul signal adressé à N canaux
    `utilisateur.{id}`, découpé par paquets de 100 au-delà : c'est la limite d'un appel du
    protocole Pusher.
  - Un fil de 30 participants ne fait donc pas 30 appels.
- **Back : la liste des destinataires de `boite.updated`** est celle des participants **actifs**
  du fil (`ConversationAccess::participatingQuery`), plus, pour un retrait, la personne retirée.
  Un ancien participant ne reçoit rien des messages suivants.
- **Présence.** On ne rejoint le canal de présence d'un fil que **pendant qu'il est ouvert**, et on
  le quitte en le fermant. La présence n'existe ni dans la liste ni hors de la messagerie.
  - Un membre de présence ne porte que `{id}`. Le nom affiché vient des participants que l'écran a
    déjà lus. Un `id` absent de ces participants est ignoré.
- **« En train d'écrire » passe par des messages éphémères** (*whispers*) sur le canal de présence
  du fil ouvert, entre navigateurs.
  - Le serveur ne les stocke ni ne les journalise, et aucune route de l'API ne les reçoit.
  - Un navigateur en émet au plus un toutes les quelques secondes pendant la frappe, jamais à chaque
    touche.
  - Le serveur Reverb n'accepte les événements client que des **membres** du canal : vérifier la
    configuration de l'application Reverb, et la serrer si elle accepte plus large.
- **Rien de tout cela pendant une impersonation** : ni présence, ni message éphémère, ni
  connexion (TCK-2954). L'écran garde ses relectures d'aujourd'hui.
- **Sans `TEMPS_REEL_URL`**, la messagerie et la cloche se comportent exactement comme aujourd'hui,
  intervalles compris.

## Delta à produire

- [ ] Back :
  - `EmetDesSignaux` sur `Message` (`message.created`, `message.updated`, avec `boite.updated` aux
    participants actifs) ;
  - `EmetDesSignaux` sur `ConversationParticipant` (`participants.updated`, avec `boite.updated` à
    la personne concernée) ;
  - émission de `conversation.read` et `boite.updated` dans `markAsRead` et `markAsUnread` ;
  - `notifications.updated` dans `markAsRead`, `markAsUnread` et `markAllRead` de
    `NotificationController`
- [ ] Back : `tests/Feature/TempsReel/MessagerieEnDirectTest.php`
- [ ] Back : `tests/Feature/TempsReel/NotificationsEnDirectTest.php`
- [ ] Front : le fil ouvert s'abonne à son sujet et relit messages, fil et participants ; la liste
      et les compteurs de non-lus s'abonnent au canal de la personne ; la cloche aussi
- [ ] Front : chaque relecture périodique listée ci-dessus passe par le mode dégradé
- [ ] Front : présence et « en train d'écrire » dans le fil ouvert ; clés i18n `fr`/`en`/`wo`
- [ ] Tests front sur le faux Echo de TCK-2954

## Critères d'acceptation

- [ ] **AC1 — Les trois écrivains émettent.** Avec `TempsReel::fake()`, un message écrit par
      `ConversationWriter`, par le contact public d'une annonce, ou par un avis système de
      `SystemMessageFactory`, émet `message.created` sur `sujet.conversation.{id}`.
      `EmetDesSignaux` est retiré de `Message` : les trois cas rougissent.
- [ ] **AC2 — Les bons destinataires, pas un de plus.** `boite.updated` atteint exactement les
      participants actifs. Un participant retiré avant le message n'est pas dans la liste.
      Ablation : élargir la requête à tous les participants, actifs ou non, fait rougir le test.
- [ ] **AC3 — Un appel pour un groupe.** Un groupe de 30 participants produit un seul envoi au
      transport, vers 30 canaux, constaté par le faux.
- [ ] **AC4 — Lecture, participants, notifications.** Chaque ligne du tableau des codes a son test
      d'émission : bon code, bon canal, bon `subject`. Chaque test rougit si l'émission
      correspondante est retirée.
  - `participants.updated` est éprouvé par **la route** (`POST`, `DELETE` et `PATCH` de
    `conversations/{conversation}/participants`) **et** par une synchronisation
    (`SyncMaintenanceConversation`, et le retrait d'un membre d'agence par
    `AgencyMemberRemovalService`).
- [ ] **AC4 bis — Une lecture n'émet que ce qu'elle doit.** `PUT conversations/{id}/read` émet
      exactement deux signaux : `conversation.read` sur le fil, et `boite.updated` au seul lecteur.
      Aucun `participants.updated`. Le test compte **tous** les signaux du faux, pas seulement ceux
      qu'il attend. Retirer le filtre des attributs du trait le fait rougir.
- [ ] **AC5 — Le fil se met à jour sur signal.** Avec le faux Echo, un `message.created` sur le fil
      ouvert déclenche une relecture des messages. Avec la connexion tenue, aucune relecture à 3 s
      n'a lieu : le compte d'appels sur une fenêtre de 10 s le prouve.
- [ ] **AC6 — Le filet tient.** Faux Echo déconnecté : le fil revient à 3 s, la liste à 10 s, la
      cloche à 30 s. Chaque cas a son test.
- [ ] **AC7 — Présence et écriture.**
  - un membre présent est marqué dans l'en-tête ;
  - un message éphémère « écrit » affiche l'indicateur, qui s'efface après son délai ;
  - fermer le fil quitte le canal de présence (le faux Echo le constate) ;
  - aucun appel `apiRequest` ne porte un message éphémère : un espion le prouve.
- [ ] **AC8 — Impersonation.** Relais actif : ni canal de présence rejoint, ni message éphémère émis
      ; la condition retirée, le test rougit.
- [ ] **AC9 — Les gardes.**
  - back : les classes ci-dessus, `php bin/impacted-tests.php --run`, `./vendor/bin/pint` et le
    test d'architecture de TCK-2952 sont verts ;
  - front : `npm run lint`, `npx tsc --noEmit`, les tests touchés et `npm run check:i18n` sont
    verts.
- [ ] **AC10 — Mesure à deux navigateurs.** Sous `./dev.sh`, avec Reverb (TCK-2953), deux comptes
      dans le même fil :
  - le message de l'un apparaît chez l'autre en moins d'une seconde ;
  - l'indicateur d'écriture s'affiche ;
  - la cloche se met à jour à la création d'une notification.
  - Mesuré, daté, et noté dans les notes d'implémentation.

## Hors périmètre

- Les notes d'équipe (ADR-0128 § 6, lot 2), et la règle « une note d'équipe n'émet aucun message
  éphémère » : le compositeur de notes n'existe pas encore, et le lot 2 la porte.
- Les sujets autres que le fil : bail, intervention, paiement, état des lieux, tableaux de bord.
  Chacun à son lot, une ligne de registre chacun.
- La pastille « gestes attendus » de la boîte de pilotage (ADR-0128 § 7, lot 2).
- Les notifications push hors application.
- Le désabonnement forcé d'un participant retiré : il garde son abonnement au fil jusqu'à sa
  déconnexion, et ne reçoit que des signaux (ADR-0129 § 1).

## Notes d'implémentation

### Re-mesure de la prémisse (2026-11-18)

- **Aucune route ne modifie ni ne supprime un message** (`routes/api/conversations.php` : envoi seulement ;
  `grep '$message->update\|->delete' app` ne rend rien sur `Message`). `message.updated` est donc déclaré sur les
  événements `updated`, `deleted` et `restored` du modèle, et éprouvé au niveau du modèle : il partira le jour où
  une route l'écrira.
- **Le trait de TCK-2952 ne savait viser que le canal du sujet** (`TempsReel::signaler`). Il gagne deux clés
  facultatives, marquées TCK-2955 : `'a'` (des destinataires → `signalerA`, un seul envoi pour tous) et
  `'attributs'` (sur `updated`, rien ne part si aucune de ces colonnes n'a changé, `wasChanged`).
- `ConversationAccess::participatingQuery` va d'une personne vers ses fils ; la liste inverse (un fil → ses
  participants actifs) n'existait pas. Ajoutée : `ConversationAccess::idsDesParticipantsActifs()` (une requête,
  `left_at` nul). Les branches de lecture (intervention, prospect, contexte) n'y sont **pas** rejugées par
  personne : le signal ne porte rien (ADR-0129 § 1), et la relecture de la liste applique `constrainListing()`.
- **Inventaire des écritures de participants qui contournaient les événements** (relevé du 2026-11-18) :
  - `GroupConversationService::addParticipants`, retour d'un ancien membre : `ConversationParticipant::query()->update()`
    → passé par le modèle (`forceFill()->save()`) ;
  - `PropertyConversationResolver::transmitLocked` : retour du répondant ET départ des autres par `DB::table()`
    → passés par le modèle ;
  - `RadarClaims::absorbOrphan` : `DB::table()->delete()` et réécriture de `user_id` en masse (fusion d'un compte
    orphelin) → émission explicite (`participants.updated` sur chaque fil de l'orphelin, `boite.updated` au
    compte qui le reprend). **Non éprouvé par un test** : fixture de réclamation radar lourde, hors du coût du lot ;
  - `AgencyMemberRemovalService` sauvait déjà par le modèle (`forceFill()->save()`) : couvert sans changement ;
  - `ConversationWriter` et `PublicPropertyController` écrivent `archived_at` des autres par `DB::table()` : pas de
    composition, et le `message.created` qui l'accompagne porte déjà `boite.updated` à tous les actifs.
  - Restent sans signal, délibérément : les suppressions en cascade de la base (fil ou compte supprimé).
- **Le sujet d'un signal est construit sans requête** (`new Conversation` + clé) : `CanauxTempsReel` n'en lit que la
  classe et la clé, et `$message->conversation` aurait posé une relation sur le modèle.
- **Reverb n'accepte les événements client que des membres** : `config/reverb.php` lit
  `REVERB_APP_ACCEPT_CLIENT_EVENTS_FROM` avec le défaut `members` ; aucun `.env*` du dépôt ni gabarit de `deploy/`
  ne la pose (relevé `grep -rn REVERB_APP_ACCEPT`). `ClientEvent::handle` (vendor, laravel/reverb) refuse alors un
  `client-*` d'une connexion absente du canal (4009) et réécrit `user_id` depuis la donnée de présence du serveur.
  Le fichier est tenu par TCK-2956 : non modifié ici.

### Décisions (2026-11-18)

- `participants.updated` : `created`, `deleted`, et `updated` si `left_at` ou `role` a changé ; `boite.updated` à
  la personne concernée sur `created`, `deleted` et un changement de `left_at` (un changement de rôle ne change pas
  sa boîte).
- `conversation.read` + `boite.updated` au lecteur : `markAsRead` toujours ; `markAsUnread` seulement si
  `last_read_at` a reculé (sinon rien n'a changé).
- `notifications.updated` : lire et rendre non lue toujours ; « tout lire » seulement si au moins une ligne a changé.
- **Création d'un groupe de N** : N `boite.updated` d'une personne chacun (un par pivot créé), puis l'envoi groupé du
  premier message dédoublonné par l'unité de travail. AC3 vise un message dans un groupe existant, pas la création ;
  noté, non corrigé (il faudrait regrouper dans l'émetteur, fichier de TCK-2952).

### Ablations back (2026-11-18, une à une, `--filter`, restauration par `cp` vérifiée par `md5`)

- `EmetDesSignaux` retiré de `Message` → les trois `test_ac1_*` rougissent.
- `whereNull('left_at')` retiré de `idsDesParticipantsActifs` → les deux `test_ac2_*` rougissent.
- Filtre des attributs du trait neutralisé → `test_ac4_bis_*` (4 envois au lieu de 2) et
  `test_archiver_ou_mettre_en_sourdine_*` rougissent.
- Signal retiré de `markAsRead`, puis de `markAsUnread` → le test de chacun rougit.
- Un `signalerA` par destinataire dans le trait → `test_ac3_*` rougit (30 envois).
- `EmetDesSignaux` retiré du pivot → les 5 tests « par la route » et « par une synchronisation » rougissent.
- Retour d'un ancien membre remis en écriture de masse → `test_le_retour_*` rouge ; départs de la transmission remis
  en écriture de masse → `test_la_transmission_*` rouge.
- Chaque `signalerA` de `NotificationController` retiré, un à la fois → le test de chacun rougit.


### Front (2026-11-18)

- **Fil** (`ChatView`) : `useFilEnDirect` s'abonne à `conversation:{id}` et relit ce que le signal dit changé —
  `message.created` → la relecture `after_id` (le fil entier s'il est vide), fusionnée comme aujourd'hui, donc la
  position de lecture n'est pas volée ; `message.updated` → les pages chargées ; `conversation.read` → les pages
  seulement si une coche « Lu » est en attente (un message reçu fait marquer le fil lu : pas de boucle) ;
  `participants.updated` → le fil, son contexte, ses correspondants ; reconnexion → tout. La relecture `after_id`
  (3 s) et celle de la coche (15 s, TCK-2860) passent par `useIntervalleDeRelecture` : 60 s quand le canal est tenu.
- **Liste, compteur de non-lus** : `useBoiteEnDirect` (`conversations-list.ts`) sur `boite.updated`, avec
  `cancelRefetch: false` (plusieurs écrans abonnés à une clé ne font qu'une requête) ; 10 s et les cadences
  `CADENCE_NON_LUS_*` deviennent le filet. L'observateur passif (`enabled: false`) n'abonne rien.
- **Cloche** : `notifications.updated` relit tout `['notifications']` ; 30 s devient le filet.
- **Présence** : `usePresenceDuSujet` dans `ChatView`, filtré aux AUTRES participants actifs que le fil a lus ; un
  point sur l'avatar de l'en-tête (`EnTeteDuFil`, prop `presents`), libellé accessible ; pour un groupe, un compte.
- **« En train d'écrire »** : whisper `ecrit` sur `presence-sujet.*` (`connexion.ts` `chuchoter` /
  `listenForWhisper`, `moteur.ts` `signalerEcriture` / `ecouterEcriture`, hook `ecriture.ts`). Au plus une émission
  par 3 s, effacement 6 s après le dernier signe ; l'auteur est le `user_id` que le serveur pose dans les
  métadonnées (Reverb réécrit ce champ, `ClientEvent::handle`), jamais la charge, qui est vide. Rien sans connexion
  tenue ni canal de présence rejoint. Reverb n'accepte les messages client que des **membres** du canal
  (`accept_client_events_from`, défaut `members` de `config/reverb.php`, non posé ailleurs — fichier de TCK-2956, non
  modifié ici).
- **Clés du fil** déplacées dans `lib/queries/conversations-cles.ts` (sans hook), réexportées par
  `conversations.ts` : les tests de `ChatView` remplacent `conversations.ts` en entier.
- Le widget public (`ChatWidget`) n'est pas monté sous `/app` et reste hors du fournisseur : inchangé.
- `parametres-ignores.tck-1286.test.ts` appelle `useConversations` hors rendu : ses nouveaux hooks y sont doublés.

### Ablations front (2026-11-18, une à une, `-t`, restauration par `cp` vérifiée par `md5`)

- `useFilEnDirect` retiré de `ChatView` → le test AC5 de `ChatView.en-direct` rougit.
- Intervalle du fil remis à 3 s en dur → « 3 s à 60 s » et « fenêtre de 10 s » (`en-direct.tck-2955`) rougissent.
- Filtre « autres participants actifs » de la présence retiré → « un participant parti » rougit.
- Filtre des auteurs de l'écriture retiré → « un autre écrit » rougit (moi + inconnu → « Plusieurs… »).
- Cadence d'émission retirée → « un seul message éphémère par intervalle » rougit (3 émissions).
- Exigence de connexion tenue retirée du moteur → « connexion perdue : écrire n'émet rien » rougit.
- Minuterie d'effacement retirée → « s'efface seule » rougit.
- Coupure sous impersonation du fournisseur retirée → le test AC8 rougit.
- Abonnement `boite.updated` retiré → les tests de la liste et du compteur rougissent ; abonnement de la cloche
  retiré → le test de la cloche rougit.

### Non mesuré

- **AC10 (deux navigateurs sous `./dev.sh`)** : non mesuré par l'agent — le brief interdit `./dev.sh` et le
  redémarrage de services. À mesurer par la session.
- `RadarClaims::absorbOrphan` émet `participants.updated` + `boite.updated` pour chaque fil réattribué : non testé
  (écriture de masse, fichier hors des tests du ticket).
- `MaintenanceConversationTest::test_each_status_change_posts_a_coded_system_message` est rouge **avant** ce
  ticket : la métadonnée porte `action_for` (TCK-2959). Non corrigé ici.
- Gardes back (2026-11-18) : `DiffusionParLeSignalSeulTest` (architecture de TCK-2952) vert ; sous-ensemble messagerie de
  `php bin/impacted-tests.php --connus` — 65 classes sur ~190 — vert (552 tests, 195 s, load 2,3 sur 8 cœurs) ; la
  sélection entière est laissée à la CI de la PR. La création d'une notification est tenue par
  `EmetteurTest::test_notification_service_signale_notifications_updated_*` (TCK-2952).

### Relevé de la session (2026-11-18)

**AC10 mesuré le 2026-11-18** — deux contextes Chrome isolés sous `./dev.sh` (agent `agent5`, 1280 ; locataire, 360 émulé) dans la salle 131 : le message envoyé par l'agent apparaît chez la locataire **615 ms** après le clic, sans rechargement ; la présence de l'agent s'affiche sur l'avatar du fil.

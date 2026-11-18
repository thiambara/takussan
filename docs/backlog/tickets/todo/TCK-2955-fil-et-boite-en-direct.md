---
id: TCK-2955
title: "Le fil, la boîte et les notifications en direct ; présence et « en train d'écrire » dans un fil ouvert"
status: todo
phase: P1
family: full
estimate: M
wave: 93
created: 2026-11-17
updated: 2026-11-17
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

_(à remplir par implementing-specs)_

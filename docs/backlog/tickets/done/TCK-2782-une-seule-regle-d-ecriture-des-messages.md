---
id: TCK-2782
title: "Messagerie : une seule règle d'écriture — le message initial d'une directe reprise ou d'un groupe passe par `allowsWriting`, comme un envoi"
status: done
phase: P2
family: back
estimate: S
wave: 90
created: 2026-11-13
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  models:
    - "docs/models-spec.md#18-conversation-"
    - "docs/models-spec.md#20-message-"
tags: [back, messagerie, autorisation, dette, suite-de-tck-2753]
---

## Objectif utilisateur

Qui n'a pas le droit d'écrire dans un fil n'y écrit par aucune porte. Un « nouveau » message vers une conversation
déjà ouverte est jugé comme un envoi dans cette conversation.

## Contrat de données

**Décision.** Porteur, 2026-11-13, liste du soir n° 26 : ticket de suivi. Relevé af (TCK-2753 S2 q2) : « aucune faille
trouvée aujourd'hui, mais la règle d'écriture est dupliquée ».

**Constat, relu sur l'arbre du 2026-11-13.** Quatre chemins écrivent un message au nom d'un utilisateur
(`messages()->create`) :

| Chemin | Garde d'écriture appliquée |
|---|---|
| `ConversationController::sendMessage` (`POST /api/conversations/{id}/messages`) | `SendMessageConversationRequest::authorize()` → `ConversationAccess::allowsWriting` |
| `ConversationController::store`, directe : `initial_message` | **aucune**. `DirectConversationService::firstOrCreate` rend la directe existante (200) et le message s'y écrit |
| `ConversationController::storeGroup` : `initial_message` | **aucune**, en dehors des gardes de création du groupe |
| `PublicPropertyController` (contact public d'une annonce) | celles du formulaire public |

`SystemMessageFactory` écrit aussi, sans auteur humain.

- Le risque est structurel. Une directe **reprise** par `firstOrCreate` n'est pas une création : c'est un envoi
  dans un fil existant, jugé aujourd'hui par les seules gardes de création (`guardContext`, `MessagingReach`).
- Il ne mène à aucune faille aujourd'hui, parce que ces gardes ferment les mêmes cas : r1 de la
  contre-vérification de 2eba3431c, qui fermait un message initial écrit « là où `POST …/messages` rend 403 ».
- Mais toute règle ajoutée demain à `allowsWriting` (fil d'intervention, demandeur au bail fini, bailleur parti)
  devra être recopiée dans les gardes de création, ou elle sera contournée.

**Endpoints touchés :** `POST /api/conversations` (directe et groupe), et `POST /api/conversations/{id}/messages`
sans changement de comportement.

## Contraintes strictes (métier)

- **Un seul point d'écriture** pour les trois chemins de `ConversationController` : un service, par exemple
  `ConversationWriter::post(User, Conversation, array)`. Il appelle `allowsWriting`, puis crée le message, met à
  jour le pointeur du fil et le désarchivage, et déclenche `NotifyNewMessageJob` après le commit.
- **Directe reprise** dont `allowsWriting` est faux : 403, avec le même corps que celui de
  `SendMessageConversationRequest`, sans code inventé. Rien n'est écrit et aucune notification ne part.
- **Directe ou groupe créé** dans la requête : l'auteur, fraîchement participant, passe `allowsWriting` comme
  avant. Aucun verdict de création ne change.
- **Le contact public d'une annonce et les messages système restent hors de cette règle**, chacun pour une raison
  écrite dans le code :
  - le contact public est la porte du visiteur. La décision y q2 du 2026-11-13 laisse un bailleur suspendu écrire à
    sa propre annonce par ce formulaire, comme tout visiteur ;
  - le message système n'a pas d'auteur.
- Une garde d'architecture empêche qu'un nouveau `messages()->create(` apparaisse hors du service et des deux
  exceptions.

## Delta à produire

- [ ] Service `App\Services\Messaging\ConversationWriter`, qui reprend le corps transactionnel de `sendMessage` :
  message, `last_message_*`, marqueur de lecture de l'expéditeur, désarchivage, notification après le commit.
- [ ] `ConversationController::sendMessage`, `store` (directe) et `storeGroup` l'appellent. `store` rend 403 avant
  tout écrit quand la directe reprise refuse l'écriture.
- [ ] Garde `tests/Unit/Architecture/EcritureDeMessageUniqueTest.php` : `messages()->create(` et `Message::create(`
  n'apparaissent que dans `ConversationWriter`, `PublicPropertyController` et `SystemMessageFactory`, chaque
  exception avec son motif.
- [ ] Tests `MessageInitialRegleDEcritureTest` :
  - directe reprise vers un fil où l'auteur lit sans écrire : le bailleur parti dans le fil de son ancien bail
    (q1, § 5 d'ADR-0108), et le demandeur au bail fini d'un fil d'intervention. Voir l'AC1 amendé : ces deux cas ne
    sont pas atteignables par une reprise. Le premier est témoin (422), le second n'existe pas ;
  - groupe créé avec message initial ;
  - directe neuve avec message initial.

## Critères d'acceptation

- [ ] AC1 (amendé le 2026-11-13) — Pour un fil où `allowsWriting` refuse l'auteur, et où donc
  `POST /api/conversations/{id}/messages` rend 403, `POST /api/conversations` qui reprend ce même fil avec un
  `initial_message` rend 403, avec le même corps. Rien n'est écrit : ni message, ni fil, ni participant. Le pointeur
  `last_message_*` ne change pas, et aucun `NotifyNewMessageJob` n'est poussé. Même verdict pour une directe neuve
  et pour un groupe que `allowsWriting` refuse à leur auteur : ni directe neuve, ni groupe vide, ni invitation.
  *Pourquoi l'amendement :* aucun état atteignable n'exerce ce refus aujourd'hui.
  - Le bailleur parti ou suspendu est arrêté à la validation (422 de `guardContext`), avant le contrôleur.
  - Un fil d'intervention est un groupe, et `DirectConversationService` ne reprend que des directes : il n'est jamais
    repris.
  - La propriété « toute règle de `allowsWriting` s'applique au message initial » se prouve donc par un double de
    `ConversationAccess` lié dans le conteneur.
  - Le parti et le suspendu restent témoins : 422, rien d'écrit.
  Décision de team-lead du 2026-11-13, option a.
- [ ] AC2 — Une directe neuve avec `initial_message` rend 201 avec le message, comme aujourd'hui. Une directe reprise
  où l'auteur a le droit d'écrire rend 200 avec le message.
- [ ] AC3 — Un groupe créé avec `initial_message` rend 201 et notifie comme aujourd'hui.
- [ ] AC4 — Le contact public d'une annonce par un bailleur suspendu sur sa propre annonce reste admis (décision y
  q2), et un test l'épingle.
- [ ] AC5 — La garde d'architecture est rouge si l'on ajoute un `messages()->create(` dans un contrôleur.
- [ ] AC6 — Vérifié par ablation. `store` sans l'appel au service, avec l'écriture d'avant, rend AC1 rouge.

## Hors périmètre

- Fermer en lecture seule la directe sans contexte entre un bailleur parti et une personne de l'agence. La décision r
  la laisse ouverte, et ce ticket ne la change pas : tant que `allowsWriting` l'admet, elle reste admise.
- Revoir les gardes de création (`guardContext`, `MessagingReach`).

## Notes d'implémentation

**Prémisse re-mesurée le 2026-11-13 sur b512ccfe5**, par une sonde jetable puis supprimée.

- **La règle divergeait, sans faille atteignable.** `contextAllowsWriting` ferme tout profil non actif ; les gardes
  de création (`agencesFermeesAuBailleur`) ne ferment que `blocked` et `inactive`. Exemple : un OwnerProfile en
  `draft` porté par le bailleur du bail. L'envoi rendait 403, et pourtant le message initial s'écrivait :
  reprise 200, directe neuve 201, groupe 201. Cet état n'est pas produit par l'application :
  `OwnerInvitationService` crée le draft avec `user_id` nul, et l'acceptation pose `user_id` et `active` dans le
  même `save()`.
- **Témoins :**
  - le bailleur parti ou suspendu est arrêté à la validation (422 `lease_id`) ;
  - un fil d'intervention est un groupe et n'est jamais repris ;
  - le contact public d'un bailleur suspendu sur sa propre annonce rend 201 quand le contact principal est un agent
    collaborateur. Sans collaborateur, c'est 422 `message.no_recipient`.

**Livré :**

- `App\Services\Messaging\ConversationWriter::post(User, Conversation, array, ?Closure $joindre)`.
  - Il juge `allowsWriting` avant tout écrit. Un refus rend `abort(403)`, avec le même corps `http.forbidden` que
    `SendMessageConversationRequest` ; le test compare les deux corps.
  - Puis il fait, en une transaction : le message, la pièce (`$joindre`), le pointeur (255 caractères ou l'aperçu
    neutre), `last_read_at` de l'auteur et le désarchivage.
  - Enfin il pousse `NotifyNewMessageJob`, dont la file est en `after_commit`.
- `ConversationController` :
  - `sendMessage` passe par le service, et la pièce est rangée dans sa transaction ;
  - `store` (directe) l'appelle dans la transaction de `firstOrCreate` : une directe neuve refusée est annulée ;
  - `storeGroup` l'appelle par le nouveau crochet `GroupConversationService::create(…, avantLesInvitations:)`, dans
    la transaction de création et avant les invitations : un refus ne laisse ni groupe vide ni invitation.
- **Effet de bord accepté** (team-lead, 2026-11-13) : le message initial d'une directe ou d'un groupe pose désormais
  le `last_read_at` de son auteur et désarchive le fil pour les autres, comme un envoi. Avant, la directe ne le
  faisait pas, et le groupe ne posait son pointeur que par l'observer (aperçu de 120 caractères).
- **Garde `tests/Unit/Architecture/EcritureDeMessageUniqueTest.php`.**
  - Elle lit les jetons PHP : commentaires ignorés, chaînes vidées sauf `'messages'`.
  - Elle reconnaît quatre formes : relation `messages()`, modèle `Message::`, `new Message(`, et
    `DB::table('messages')` suivi d'une écriture.
  - Liste fermée dans les deux sens : `ConversationWriter`, `PublicPropertyController` (décision y q2) et
    `SystemMessageFactory` (sans auteur). Chaque forme est épinglée en rouge et en vert.
- **Test `tests/Feature/Messaging/MessageInitialRegleDEcritureTest.php` (8 tests).**
  - AC1 : reprise, directe neuve, groupe, par un double de `ConversationAccess` lié dans le conteneur.
  - Témoins parti et suspendu : 422, rien d'écrit.
  - AC2 : reprise permise (200, lecture de l'auteur, désarchivage), directe neuve (201).
  - AC3 : groupe (201, `NotifyNewMessageJob`, invitations), puis AC4.
- **Vérification :**
  - 137 verts : le test et la garde, plus `ConversationTest`, `ConversationUnreadCountTest`,
    `ConversationArchiveReadTest`, `GroupConversationCreationTest`, `OwnerDepartedReachTest`,
    `OwnerDepartedThreadTest`, `PropertyContactMessageTest`, `AudioMessageTest`, `MessageAttachmentTest` et les
    trois gardes du brief.
  - Ablations, rouges puis restaurées (vérifié par `cmp`) :
    - `store` qui écrit sans le service → AC1 reprise et directe neuve, 2 rouges (AC6) ;
    - `allowsWriting` retiré du service → les 3 AC1 ;
    - le message du groupe écrit après la création et les invitations → AC1 groupe, 1 rouge (« ni groupe vide ») ;
    - un `messages()->create(` ajouté dans `ConversationController` → la garde, 1 rouge (AC5).

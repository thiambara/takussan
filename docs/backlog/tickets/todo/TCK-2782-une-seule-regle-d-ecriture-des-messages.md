---
id: TCK-2782
title: "Messagerie : une seule règle d'écriture — le message initial d'une directe reprise ou d'un groupe passe par `allowsWriting`, comme un envoi"
status: todo
phase: P2
family: back
estimate: S
wave: 90
created: 2026-11-13
updated: 2026-11-13
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
    (q1, § 5 d'ADR-0108), et le demandeur au bail fini d'un fil d'intervention ;
  - groupe créé avec message initial ;
  - directe neuve avec message initial.

## Critères d'acceptation

- [ ] AC1 — Pour un fil où `POST /api/conversations/{id}/messages` rend 403, `POST /api/conversations` qui reprend
  ce même fil avec un `initial_message` rend 403. Aucun message n'est écrit, `last_message_at` ne change pas et
  aucun `NotifyNewMessageJob` n'est poussé.
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

_(à remplir par implementing-specs)_

---
id: TCK-085
title: "Conversations de groupe (multi-participants)"
status: todo
phase: P2
family: applicatif
estimate: M
created: 2026-04-24
updated: 2026-04-24
depends_on: [TCK-029, TCK-045]
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models:
    - docs/models-spec.md#18-conversation-
    - docs/models-spec.md#19-conversationparticipant-
    - docs/models-spec.md#20-message-
tags: [back, front, messaging, conversations, group]
---

## Objectif utilisateur

Permettre à un Agent, Bailleur ou Locataire de créer une conversation de
groupe (> 2 participants) autour d'un bien, d'un bail ou d'une demande de
maintenance, avec ajout/retrait de participants, distinction des rôles
(member / admin), et persistance du statut non-lu par participant.

## Contrat de données

Le modèle `Conversation` accepte déjà `type = direct | group | support` (§18)
et `ConversationParticipant` supporte déjà `role` et `left_at` (§19). Ce
ticket **consomme** les schémas existants — aucune migration majeure requise
si tout est bien implémenté par TCK-029. **À vérifier en pré-analyse** :
s'assurer que `type` enum est bien déployé en base et que le `role` pivot
accepte `admin`.

**Endpoints nouveaux** :

- `POST /api/conversations` body `{ type: 'group', subject, participant_ids: [...], property_id?, lease_id? }`
  — si le type existe déjà pour les `direct`, étendre le handler.
- `POST /api/conversations/{id}/participants` body `{ user_ids: [...], role? }`
  — ajoute des participants ; uniquement accessible à un participant avec
  `role = admin`.
- `DELETE /api/conversations/{id}/participants/{user_id}` — retire un
  participant (le créateur / admin, ou le participant lui-même qui quitte).
- `PATCH /api/conversations/{id}/participants/{user_id}` body `{ role }` —
  promote / demote entre member et admin.
- `PATCH /api/conversations/{id}` body `{ subject, is_muted? }` — rename du
  groupe (admin only) ; `is_muted` est **per-participant**, donc stocké sur
  `ConversationParticipant.is_muted`, route séparée.

Le système `last_read_at` par `ConversationParticipant` reste le mécanisme de
non-lu (voir §19 note). **Pas de table `message_reads`** en V1 — ce n'est à
introduire que lorsque le P2 "Accusés de lecture individuels (si > 5
participants)" est ouvert (ticket EF dédié).

## Direction UX / Artistique

**Modale "Nouveau groupe"** : multi-select de participants (avec search par
nom/email), champ subject obligatoire, sélection optionnelle d'un bien / bail
/ demande de maintenance à rattacher. Min 3 participants (créateur + 2
autres). Max 20 (limite technique, message clair si dépassé).

**Liste des conversations** : les groupes sont visuellement distincts — avatars
stack (3 avatars superposés + "+N"), badge "Groupe", bouton discret pour
afficher les participants.

**Vue conversation groupe** : bandeau top avec subject + count participants +
icône settings → ouvre un panneau latéral "Infos groupe" avec liste des
membres (rôle, muet, actions admin : promote/remove). Un member peut quitter
("Quitter le groupe" en bas du panneau).

**System messages** : les événements (ajout / retrait / changement de rôle /
rename / mute) apparaissent inline dans le fil comme des lignes neutres
("Alice a ajouté Bob au groupe"). Utilise `Message.type = system` avec
`metadata.event` = ajout_participant / retrait / rename / role_change.

**Mute visuel** : participant muté → icône 🔕 sur la ligne de la conversation
dans la liste ; notifications push suppressed pour cette conversation.

## Contraintes strictes (métier)

- **Création** : le créateur est automatiquement `admin` du groupe ; les
  autres participants sont `member` par défaut.
- **Admin-only actions** : ajouter/retirer/promouvoir un participant, renommer
  la conversation, archiver → admins uniquement. 403 sinon.
- **Quitter** : un participant `member` peut quitter lui-même (set `left_at`).
  Un `admin` ne peut pas quitter s'il est le dernier admin — un transfert de
  rôle est requis avant (422 "Promouvoir un autre admin avant de quitter").
- **Non-retour** : un participant qui a quitté (`left_at != null`) ne reçoit
  plus les messages. Il peut être réinvité (nouveau `joined_at`, `left_at =
  null`). Les messages passés **restent accessibles en lecture pour lui** tant
  que la conversation n'est pas supprimée, via une route de lecture
  read-only ? → **Hors périmètre** : on simplifie — un participant qui a
  quitté perd l'accès. La conversation n'apparaît plus dans sa liste.
- **Scope & permissions** : les users ajoutés à un groupe doivent soit
  appartenir à l'agence du bien/bail lié, soit être explicitement "invités
  par relation existante" (l'agent peut ajouter ses clients, un client peut
  ajouter son agent). Refuser l'ajout d'un user tiers sans contexte (422).
- **System messages** : immuables, pas de soft-delete, `sender_id = null` ou
  l'acteur système. `type = system` + `metadata.event`.
- **last_message caches** : après chaque nouveau message / system message,
  les 3 caches sur Conversation sont mis à jour via MessageObserver.
- **Limite technique** 20 participants : validé en FormRequest + garde-fou
  DB au cas où.

## Delta à produire

- [ ] Vérifier que `ConversationType` enum est bien déployé (sinon migration additive)
- [ ] Vérifier que `ConversationParticipant` a bien `role`, `left_at`, `is_muted` (sinon migrations additives)
- [ ] Service `App\Services\Messaging\GroupConversationService` (create / add / remove / promote / leave / system-message)
- [ ] Controller `App\Http\Controllers\Api\ConversationController` : étendre store pour `type=group`
- [ ] Controller `App\Http\Controllers\Api\ConversationParticipantController` (store / destroy / update)
- [ ] FormRequest `CreateGroupConversationRequest` (subject required, participants 3–20)
- [ ] FormRequest `AddParticipantsRequest` (user_ids scope check)
- [ ] Policy `ConversationPolicy@addParticipant`, `@removeParticipant`, `@promote`, `@rename` (admin only)
- [ ] Routes `routes/api/conversations.php` (ou extension existante)
- [ ] System message generator : helper `SystemMessageFactory::participantAdded($conversation, $actor, $target)` etc.
- [ ] Notification `ConversationInviteNotification` (envoyée aux nouveaux ajoutés, respecte PreferenceResolver + is_muted)
- [ ] MessageObserver maintient last_message caches (vérifier l'existant TCK-029)
- [ ] Tests `GroupConversationCreationTest` (happy + participants invalides + scope check)
- [ ] Tests `ParticipantManagementTest` (add/remove/promote/leave + garde "dernier admin")
- [ ] Tests `SystemMessagesTest` (4 events génèrent bien les messages + immutables)
- [ ] Tests `GroupMuteTest` (mute → notifs suppressed pour ce participant uniquement)
- [ ] Composant `NewGroupDialog` (wizard 2 étapes : sélection participants → subject/context)
- [ ] Composant `ConversationInfoSheet` (panneau latéral — liste membres, actions admin)
- [ ] Composant `ParticipantRow` avec badge role + actions
- [ ] Composant `SystemMessageBubble` (style neutre, non éditable)
- [ ] Liste des conversations : différencier visuellement direct vs group (avatars stack)
- [ ] Toggle mute per-conversation
- [ ] i18n fr/en/wo (`messaging.group.*`, `messaging.system.*`)
- [ ] Tests Vitest : `NewGroupDialog`, `ConversationInfoSheet`, `SystemMessageBubble`

## Critères d'acceptation

- [ ] AC1 — `POST /conversations` avec `type=group` + 3 participant_ids → 201, créateur auto-admin
- [ ] AC2 — même endpoint avec 1 seul autre participant → 422 (min 3 total)
- [ ] AC3 — `POST /conversations/{id}/participants` avec admin → 201 + system message généré + notif envoyée aux nouveaux
- [ ] AC4 — même endpoint avec member → 403
- [ ] AC5 — dernier admin tente de quitter → 422 avec message "Promouvoir un autre admin"
- [ ] AC6 — participant muté ne reçoit pas de notif quand un nouveau message arrive, mais le message est bien persisté
- [ ] AC7 — participant qui quitte (`left_at` set) n'apparaît plus dans sa liste de conversations
- [ ] AC8 — system message `type=system` est immuable (PATCH/DELETE → 403)
- [ ] AC9 — frontend : modale "Nouveau groupe" avec search + multi-select + context optionnel
- [ ] AC10 — panneau latéral "Infos groupe" affiche la liste des membres avec rôle et expose les actions admin

## Hors périmètre

- Accusés de lecture individuels (`message_reads` par user) — EF dédié avec trigger > 5 participants (voir models-spec §19 note + §Évolutions).
- Recherche dans l'historique des messages (P2 dédié).
- Appels audio/vidéo (P3).
- Traduction automatique FR/EN/WO des messages (P3).
- Groupes privés avec invitation par lien (non spécifié).
- Mentions `@user` dans les messages (non spécifié).

## Notes d'implémentation

_(à remplir par implementing-specs)_

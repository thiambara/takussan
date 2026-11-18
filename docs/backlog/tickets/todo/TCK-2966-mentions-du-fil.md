---
id: TCK-2966
title: "Les @mentions d'un fil : des identifiants de compte dans metadata, refusées si la personne ne lit pas le message, notifiées à qui le lit"
status: todo
phase: P2
family: back
estimate: M
wave: 95
created: 2026-11-18
updated: 2026-11-18
depends_on: [TCK-2965]
blocks: [TCK-2968]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models:
    - docs/models-spec.md#20-message-
tags: [back, messagerie, le-fil, mentions, notifications, non-fuite, adr-0128]
---

## Objectif utilisateur

- **Le personnel de l'agence et les membres d'un groupe** : ils appellent une personne précise dans un
  fil (« @Ibrahima, tu peux passer jeudi ? ») et elle est prévenue, même quand le fil est chargé.
- **La personne mentionnée** : elle sait qu'on attend quelque chose d'elle, et elle n'est jamais
  prévenue d'un message qu'elle ne peut pas lire.

## Contrat de données

- ADR-0128 § 6, dernier point : une mention est un identifiant de compte dans le `metadata` du
  message, et elle ne notifie que si la personne mentionnée lit ce message.
- **Forme** : `metadata.mentions`, liste d'identifiants d'utilisateurs, sans doublon, 10 au plus. Elle
  est posée à l'envoi par `POST /api/conversations/{conversation}/messages` (champ `mentions[]`), et
  seulement sur un message `text` ou `voice`.
- **Le texte ne porte pas d'identifiant.** Le front affiche `@Prénom Nom` depuis les participants ;
  l'API ne lit ni n'écrit de syntaxe dans `content`.
- **Qui peut être mentionné** : un participant actif du fil **qui lit ce message**. Pour une note
  d'équipe, c'est le personnel actif de l'agence du fil (`EquipeDuFil::litLesNotes`, TCK-2965). Toute
  autre mention est refusée en 422 (code sous `LangGroupParity`) : un rejet silencieux ferait croire
  à l'auteur qu'il a prévenu quelqu'un.
- **Notification** : un code `NotificationCode::MessageMention`. Il remplace, pour la personne
  mentionnée, le `MessageReceived` du même message (une seule notification, pas deux). Il part
  **même quand le fil est en sourdine** pour elle, puisque c'est le sens d'une mention (décision du
  porteur du 2026-11-18, 1a).
- **`MessageResource`** rend `metadata.mentions`, seulement à qui lit le message (le filtre de
  TCK-2965 s'en charge).

## Contraintes strictes (métier)

- **Une mention ne crée aucun accès** : mentionner n'ajoute personne au fil et n'élargit aucune
  lecture.
- **La lecture se juge à l'envoi pour le refus, et au départ de la notification pour l'envoi** : si la
  personne a quitté le fil ou l'agence entre les deux, `NotifyNewMessageJob` ne la prévient pas.
- **Le texte de la notification** suit celui de `MessageReceived` (extrait borné, nom sans contact) :
  aucune donnée de plus.
- **Le compte des non-lus ne change pas** : une mention n'ajoute pas de non-lu. Ce que la mention
  attend relève de la boîte (TCK-2967).
- **Ce code s'écrit pour un seul catalogue de notifications** : il s'ajoute aux codes de
  `NotificationCode` et à leurs préférences par canal, comme les autres. Aucun chemin de notification
  à part.

## Delta à produire

- [ ] `SendMessageConversationRequest` : `mentions` (`array`, 10 au plus, entiers distincts) et la
  règle « lit ce message ». Pour une note, elle dépend de `visibility`.
- [ ] `ConversationWriter` : `metadata.mentions` à l'écriture.
- [ ] `NotificationCode::MessageMention`, avec ses libellés `fr`/`en` côté API s'il en faut pour le
  courriel (codes, pas texte, à la frontière du front) et ses préférences par canal.
- [ ] `NotifyNewMessageJob` : les mentionnés qui lisent le message reçoivent `MessageMention`, sourdine
  comprise, et pas de `MessageReceived` en plus ; les autres destinataires ne changent pas.
- [ ] Tests :
  - `MentionsDuFilTest` : forme et dédoublonnage ;
  - les refus en 422 (non-participant, client mentionné dans une note, plus de 10 mentions,
    mention sur une carte) ;
  - une notification par personne mentionnée, y compris quand le fil est en sourdine ;
  - pas de notification pour qui a quitté le fil entre l'envoi et le job.

## Critères d'acceptation

- [ ] **AC1** — Mentionner le locataire dans une note d'équipe est refusé en 422, et aucune
  notification ne part. *Ablation : retirer la règle « lit ce message » de la requête rend ce test
  rouge ; la retirer du job aussi rend rouge le test du départ.*
- [ ] **AC2** — Un agent mentionné dans un fil qu'il a mis en sourdine reçoit `MessageMention`, une
  seule fois ; un participant non mentionné du même fil, en sourdine, ne reçoit rien.
- [ ] **AC3** — Un mentionné qui quitte le fil avant le passage du job n'est pas prévenu.
- [ ] **AC4** — `metadata.mentions` n'apparaît dans aucune réponse lue par un lecteur qui ne lit pas
  le message (couvert par la matrice de TCK-2965, plus un cas ici).
- [ ] Pint propre ; tests des fichiers touchés verts.

## Hors périmètre

- La saisie `@` dans le composeur, la liste de suggestions et l'affichage de la mention : TCK-2968.
- Les mentions d'une équipe entière (`@agence`) ou d'un rôle.
- La mention dans une carte ou un événement.

## Notes d'implémentation

### Re-mesure de la prémisse (2026-11-18)

- **Types** : le dépôt n'a ni `voice` ni `attachment`. « text ou voice » devient `text` ou `audio`
  (`MentionsDuFil::types()`). Une photo ou un PDF (`image`, `document`) ne portent pas de mention : refus
  par la règle `mentions` de la requête (`prohibited`). La route n'écrit pas de carte : la garde du type
  vit aussi dans `ConversationWriter` (422 `messaging.mention_type`), seule façon d'éprouver « mention sur
  une carte ».
- **Qui peut être mentionné** : la personne mentionnée n'est pas l'appelant. Elle est donc jugée en
  TIERS, comme un destinataire de notification : participant actif (`left_at` nul), plus
  `ConversationAccess::branchesAllow`, plus, pour une note, `EquipeDuFil::tiersLitLesNotes`. Ce n'est
  pas `EquipeDuFil::litLesNotes` comme le dit le ticket : cette fonction juge le profil actif de
  l'appelant, et elle rend vrai pour un super-admin absent du fil (`ConversationAccess::allows` aussi).
  Un test le couvre : un super-admin absent du fil ne peut pas être mentionné.
- **Une seule règle pour les deux moments** : `MentionsDuFil::lecteursParmi()` à l'envoi. Au départ,
  le job ne fait pas de requête à part pour les mentionnés : il les prend parmi ses destinataires, déjà
  filtrés (participation active, branches, lecteurs de la note).
- **La sourdine était filtrée en SQL** (`wherePivot('is_muted', false)`) dans `NotifyNewMessageJob`.
  Elle se juge maintenant par destinataire, après tous les autres filtres : un mentionné passe outre, un
  autre non. Rien d'autre dans `app/` ne lit `is_muted` pour taire une notification (relevé `grep`).
- **Doublons** : retirés, pas refusés (le ticket dit « dédoublonnage »). Forme stockée : des entiers
  uniques, triés, en liste. `max:10` se juge avant le retrait des doublons.
- **Préférence par canal** : `MessageMention` suit l'interrupteur `message_received`, sans
  interrupteur à part. Une mention est un message, et le ticket ne veut « aucun chemin à part ».
  **Choix à confirmer par la session** : pour lui donner son propre interrupteur, il faut toucher
  `PreferenceCatalog`, `PreferenceResolver` et l'écran des préférences.
- **Cloche** : `message.mention` est rangé en `demande` sans « à traiter », comme `message.received`.
  Ce que la mention attend relève de la boîte (TCK-2967).
- **Textes** : `lang/{fr,en,wo}/notifications.php` (`codes.message.mention`, title/body/sms), plus
  `notifications.codes.message.mention.{title,body}` côté front (outil `cle-i18n`, wo = fr). Les 422
  `messaging.mention_not_reader` et `messaging.mention_type` sont dans `errors.php` ×3.
- **Une mention de soi-même** est acceptée (l'auteur lit son message). Elle ne notifie pas : le job
  exclut l'expéditeur.
- **Contrôleur** : `ConversationController::sendMessage` passe `'mentions' => $data['mentions'] ?? []` au
  service, et c'est le seul changement dans ce fichier, tenu par TCK-2967. La ligne a été posée sous
  verrou, avec l'accord de la session. Sans elle, la route rend 201 et perd la mention : les deux tests de
  route le montrent.

### Ablations (2026-11-18, une à une, restauration par `cp`, md5 identique à l'original à chaque fois)

| Ablation | Rouges |
|---|---|
| règle « lit ce message » retirée de la requête | AC1, non-participant, parti du fil, super-admin absent |
| requête qui juge une note comme un message pour tous | AC1 |
| garde du type retirée du writer | carte |
| sourdine non contournée pour un mentionné | AC2, AC2 bis |
| un mentionné reçoit `MessageReceived` | AC2, AC2 bis, AC3, AC3 bis, AC1 bis |
| job : un mentionné d'une note n'est pas filtré par la lecture des notes | AC1 bis (règle retirée du job) |
| job : `left_at` non rejugé | AC3 |
| filtre de la page de TCK-2965 (`messagesLisiblesPar`) retiré | AC4 |

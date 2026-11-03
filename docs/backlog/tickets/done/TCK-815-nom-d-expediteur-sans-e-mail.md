---
id: TCK-815
title: "Messagerie : le nom d'un expéditeur ne se replie plus sur son adresse e-mail"
status: done
phase: P2
family: back
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-38--messagerie--notifications-et-isolation-des-conversations"
tags: [back, messaging, notifications, privacy, pistes]
---

## Contexte

Réf : **P38.06** du fichier de pistes, `validé` (V3 accordé).

Trois chemins remplaçaient un nom vide par l'adresse e-mail du compte : `NotifyNewMessageJob`
(expéditeur d'un message), `ConversationInviteNotification::displayInviter()` (inviteur d'un
groupe), et `PublicPropertyController::displayName()` (`username` puis e-mail, pour le
destinataire d'un contact d'annonce). `ConversationResource` pose la règle inverse pour les
membres d'un fil : le nom et l'avatar, jamais les coordonnées.

## Décision du porteur

validé — repli commun aux trois chemins : prénom et nom, puis `username`, puis `—` ; l'e-mail ne sort plus jamais ; un test qui épingle les `params` d'un expéditeur sans nom ni `username`

## Objectif utilisateur

Un utilisateur ne lit jamais l'adresse e-mail d'un autre dans une notification ou dans l'en-tête
d'un fil d'annonce.

## Contraintes strictes

- Un seul repli, partagé : `User::nameWithoutContact()`.
- Un expéditeur **absent** (compte supprimé) garde le comportement de TCK-588 (`sender` nul).

## Delta à produire

- [x] `User::nameWithoutContact()` : prénom et nom, puis `username`, puis `—`.
- [x] Les trois chemins l'appellent ; `PublicPropertyController::displayName()` est retiré.
- [x] `tests/Feature/Messaging/SenderNameWithoutContactTest.php`.

## Critères d'acceptation

- [x] AC1 — Un message d'un expéditeur sans nom ni `username` écrit
      `params = {"sender": "—", "excerpt": "x"}`.
- [x] AC2 — Le même avec un `username` rend ce `username`.
- [x] AC3 — L'invitation d'un inviteur sans nom ni `username` rend `inviter_name = "—"`, et
      l'e-mail n'apparaît nulle part dans son tableau.
- [x] AC4 — `GET /api/public/properties/{slug}/conversation` rend `recipient.name = "—"` pour un
      destinataire sans nom ni `username`.

## Hors périmètre

- Les autres notifications du dépôt qui nommeraient un compte par son e-mail : non relevées.

## Notes d'implémentation

- **Ablation** : le dernier repli remis sur l'e-mail, AC1, AC3 et AC4 rougissent, AC2 reste vert
  (attendu : il ne passe pas par ce repli) ; remis, les 4 tests sont verts.
- Depuis TCK-814, le contact d'annonce notifie par `NotifyNewMessageJob` : le chemin public
  de la notification passe donc par AC1.

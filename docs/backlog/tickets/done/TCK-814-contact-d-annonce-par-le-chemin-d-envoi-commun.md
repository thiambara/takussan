---
id: TCK-814
title: "Messagerie : le contact d'une annonce respecte la sourdine et désarchive le fil, comme un message"
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
tags: [back, messaging, notifications, pistes]
---

## Contexte

Réf : **P38.04** du fichier de pistes, `validé` (V7 accordé).

`ConversationController::sendMessage()` désarchive le fil pour les autres participants, et
notifie par `NotifyNewMessageJob`, qui écarte les participants en sourdine.
`PublicPropertyController::contactMessage()` écrivait dans le même fil puis appelait
`NotificationService::send()` en direct : un destinataire en sourdine était notifié, et le fil
restait archivé chez lui.

## Décision du porteur

validé — `contactMessage()` passe par le chemin de `sendMessage()` : désarchivage du fil pour les autres participants, puis `NotifyNewMessageJob`, qui respecte la sourdine ; un test par effet

## Objectif utilisateur

Un contact reçu par une annonce se comporte comme tout message reçu : il fait réapparaître le
fil archivé, et ne sonne pas quand le fil est en sourdine.

## Contraintes strictes

- Les écritures (message, cache `last_message_*`, pointeurs) dans une transaction ; le job
  dispatché après elle, pour que le worker voie le message.

## Delta à produire

- [x] `contactMessage()` : même suite d'écritures que `sendMessage()` (pointeur de lecture et
      archivage de l'expéditeur, désarchivage des autres), puis `NotifyNewMessageJob`.
- [x] Tests dans `PropertyContactMessageTest`, un par effet.

## Critères d'acceptation

- [x] AC1 — Le destinataire a archivé le fil ; un nouveau contact par la fiche le désarchive.
- [x] AC2 — Le destinataire a mis le fil en sourdine ; un nouveau contact par la fiche ne lui
      écrit aucune notification.

## Hors périmètre

- Le partage du code entre les deux chemins (une seule méthode) : les deux suites d'écritures
  sont recopiées, `sendMessage()` portant en plus la note vocale.

## Notes d'implémentation

- **Ablation** : sans le désarchivage, AC1 rougit seul ; avec l'envoi direct par
  `NotificationService` à la place du job, AC2 rougit seul (« 2 is identical to 1 ») ; remis,
  les 10 tests de la classe sont verts.
- Le nom de l'expéditeur vient désormais de `NotifyNewMessageJob`, et non plus de
  `PublicPropertyController::displayName()` : le repli sur `username` de ce chemin y était
  absent. Le repli commun est l'objet de P38.06 (TCK-815), dans le même lot.

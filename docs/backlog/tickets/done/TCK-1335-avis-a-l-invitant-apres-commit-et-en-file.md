---
id: TCK-1335
title: "L'avis d'acceptation à l'invitant part après le commit et en file : une panne de courriel n'empêche plus l'invité d'entrer"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-123--appels-réseau-entre-un-geste-validé-et-sa-trace-ou-sa-notification"
tags: [back, invitations, notifications, pistes]
---

## Contexte

Réf : **P123.02** du fichier de pistes, `validé` par le porteur (critère V7 accordé : défaire le
choix écrit du docblock de `finalizeAccept()`).

`InvitationService::finalizeAccept()`, appelé dans la `DB::transaction` d'`acceptAsNewUser()` et
d'`acceptForUser()`, finissait par `$inviter->notify(new InvitationAcceptedNotification(…))`,
synchrone et en `mail` seul : sous un transport qui lève, `POST /api/invitations/{token}/accept`
rendait 500, l'invitation restait `sent`, aucun compte n'était créé.

## Décision du porteur

validé — porteur (2026-10-22) : l'avis à l'invitant part après le commit (`DB::afterCommit`) et en file (`ShouldQueue`) : son échec n'empêche plus l'invité d'entrer ; docblock corrigé

## Objectif utilisateur

L'invité entre même quand le courriel de l'invitant est en panne ou refusé ; l'invitant reçoit
l'avis dès que la file le livre.

## Contrat de données

Aucun changement d'endpoint.

## Delta à produire

- [x] `InvitationAcceptedNotification` implémente `ShouldQueue`.
- [x] `finalizeAccept()` : l'avis part par `DB::afterCommit()`.
- [x] Docblock de `finalizeAccept()` corrigé : la transaction couvre les écritures, pas l'avis.
- [x] `tests/Feature/Invitation/InvitationAcceptEnPanneDeCourrielTest.php`.

## Critères d'acceptation

- [x] AC1 — file `database`, transport qui lève : l'acceptation rend 200, le compte est créé,
  l'invitation `accepted`, le profil `active`, et un seul travail `InvitationAcceptedNotification`
  attend en file.
- [x] AC2 — file `sync` et mailer `array` de la suite : l'invitant reçoit l'avis.

## Hors périmètre

- Sous `QUEUE_CONNECTION=sync`, l'envoi reste synchrone après le commit : une panne y rend encore
  500, mais l'acceptation est déjà validée. La préproduction a une file réelle.

## Notes d'implémentation

- Ablation : correctif retiré → AC1 rouge (500 `Transport indisponible (test).`), remis → 2/2.
- Hypothèse : la file `database` du test vaut la file réelle du worker pour ce contrat (le
  travail est écrit, il n'est pas exécuté dans la requête).

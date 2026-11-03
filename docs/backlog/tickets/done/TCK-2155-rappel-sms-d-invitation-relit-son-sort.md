---
id: TCK-2155
title: "Le rappel automatique d'une invitation par SMS part hors file et se retente, un essai par jour, trois au plus, quand aucun fournisseur ne l'a accepté"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
  models:
    - "docs/models-spec.md#48-invitation-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-179--trycatch-autour-dun-envoi-en-file-qui-promettent-un-repli"
tags: [api, invitations, sms, notifications, migration, pistes]
---

## Objectif utilisateur

L'invité qui n'a laissé qu'un numéro reçoit son rappel J+2 même quand le premier essai d'envoi
du SMS est refusé par tous les fournisseurs : le rappel est retenté le lendemain, trois essais au
plus, au lieu d'être marqué envoyé dès sa mise en file.

## Contexte

Réf : **P179.01** du fichier de pistes, `validé`. `InvitationService::remindPending()` posait
`last_reminded_at` dès que `deliver()` rendait la main. Pour une invitation sans e-mail,
`deliver()` passe par `NotificationService::send()` vers un `ContactSansCompte`, et
`CodedNotification` est `ShouldQueue` : la tâche ne faisait que mettre en file. Au worker, un refus
de tous les fournisseurs ne lève pas (`SmsRouterDriver` le change en `SmsResult::failed`) : le
`catch` du rappel, qui promet « non marqué, il est retenté au passage suivant », ne voyait jamais
l'échec d'un SMS.

## Décision du porteur

> validation du porteur (2026-10-24) : la recommandation du délégué (SMS du rappel hors file, marque posée sur `sent`, sur `failed` ambigu ou sur report de nuit), bornée à un essai par jour, trois au plus, comptés par une colonne additive `invitations.reminder_attempts` (petit entier, défaut 0), `last_reminded_at` tenant lieu de dernier essai ; le report de nuit compte comme un rappel posé

## Hypothèses (mode sans humain)

- **Encodage de « posé ».** `last_reminded_at` date le dernier essai ; un rappel posé met
  `reminder_attempts` au plafond (3), un essai refusé l'incrémente. Est dû : jamais rappelé
  (`last_reminded_at` nul), ou un compte entre 1 et 2 avec un dernier essai d'au moins un jour.
  Une invitation rappelée avant la colonne (compte 0, date posée) reste tenue pour rappelée :
  aucune ligne n'est réécrite.
- **Ce qui n'est pas posé** : un refus sûr de tous les fournisseurs, et un SMS que le canal n'a
  pas remis au routeur (numéro invalide, limite horaire par numéro). Le canal a choisi le SMS sans
  qu'un fournisseur ait pu le recevoir : l'invité n'a rien reçu.
- **WhatsApp** : un invité qui a consenti à WhatsApp reçoit le rappel par ce canal (envoyé hors
  file lui aussi) ; son sort n'est pas relu, comme avant (la décision porte sur le SMS).
- **Courriel** : inchangé. Synchrone, il lève sur un échec, le `catch` le laisse non marqué ; un
  rappel par courriel réussi met le compte au plafond, comme tout rappel posé.
- La relance (`resend`) remet le compte à 0 avec `last_reminded_at`.

## Delta à produire

- [x] Migration neuve : `invitations.reminder_attempts` (`unsignedSmallInteger`, défaut 0), `down()` qui la retire.
- [x] `NotificationService::sendToContactNow()` : envoi hors file vers un contact sans compte, sort du SMS rendu (`SmsOutcome`).
- [x] `SmsOutcome`, partagé entre les copies de la notification par canal ; `CodedNotification` le porte, `SmsChannel` y écrit le résultat du routeur, `contactChannels()` y note le choix du SMS.
- [x] `InvitationService::deliver()` : le rappel SMS part par `sendToContactNow()` ; `remindPending()` relit le sort, borne à un essai par jour et `MAX_REMINDER_ATTEMPTS = 3`.
- [x] `SmsResult::REASON_QUIET_HOURS`, lu par le routeur et par `SmsOutcome`.

## Critères d'acceptation

- [x] AC1 — Sous `queue.default=database`, le rappel SMS part dans la tâche (aucun job ajouté).
- [x] AC2 — Refus sûr : non posé, retenté le lendemain (pas dans l'heure), trois essais au plus.
- [x] AC3 — `sent`, `failed` ambigu ou report de nuit : posé, ne repart pas.
- [x] AC4 — Refus puis acceptation : plus de nouvel essai.
- [x] AC5 — La relance remet le compte à 0.
- [x] AC6 — Une invitation rappelée avant la colonne n'est pas rappelée de nouveau.

## Hors périmètre

- Un rappel reporté à la nuit puis refusé au matin par `SendDeferredSmsJob` : tenu pour posé, par la décision.
- `docs/models-spec.md` (table `invitations`) ne cite pas encore `reminder_attempts` : fermé à l'implémenteur, à `/sync-specs`.

## Notes d'implémentation

- `NotificationSender::sendNow()` envoie une COPIE de la notification par canal : une propriété
  scalaire posée par le canal serait perdue ; l'objet `SmsOutcome`, lui, est partagé (copie superficielle).
- Ablation : rappel remis sur `send()` (en file) → 6 rouges sur 7 ; marque toujours posée → 3 rouges ;
  ambigu et report de nuit retirés de `mayHaveReached()` → 2 rouges ; remis → 7 verts.

---
id: TCK-1388
title: "Provisionnement d'une agence : l'activation du gérant part en file, sans la promesse d'un 502"
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
    - "docs/features.md#29-administration--configuration"
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-142--notifications-et-écouteurs-en-file-sans-backoff-ni-failed-hors-codednotification"
tags: [api, notifications, file, pistes]
---

## Contexte

Réf : **P142.01** du fichier de pistes, `validé`.

`AgencyProvisioningService::sendActivationLink()` promettait, par son docblock et son `catch`,
qu'un échec d'envoi rend 502 (`mail.invitation_not_sent`) et annule le provisionnement. Or
`AgencyAdminActivationNotification` part en file (TCK-747) après la validation de la
transaction : le `catch` ne voyait jamais le transport, seulement un échec de la création du
jeton, qu'il travestissait en « e-mail non envoyé ». Le seul test du 502 remplaçait
`sendActivationLink()` entier.

## Décision du porteur

« validé — porteur (2026-10-22) : garder la file de TCK-747, corriger le docblock de `sendActivationLink()` et retirer la promesse du 502 ; `backoff` et `failed()` qui journalise sur la notification »

Critère accordé : V7.

## Objectif

Le provisionnement dit ce qu'il fait : l'activation part en file, et un échec d'envoi se
réessaie et se journalise hors de la requête.

## Delta à produire

- [x] `sendActivationLink()` sans `try`/`catch` ni `abort_code(502, …)`, docblock corrigé.
- [x] `backoff` et `failed()` sur la notification : **déjà livrés par TCK-1352** (P142.05,
      trait `RetriesWithBackoff`), rien de neuf ici.
- [x] Tests : le stub du 502 remplacé par une panne réelle du jeton (500, annulation, aucun
      `mail.invitation_not_sent`) ; sous la file `database` et un SMTP injoignable, 201 et un
      job dans `notifications-urgent`.

## Critères d'acceptation

- [x] AC1 — Un échec de la création du jeton annule le provisionnement et ne rend plus
      `mail.invitation_not_sent`.
- [x] AC2 — Sous la file `database`, un transport injoignable n'empêche pas la création :
      l'activation attend dans `notifications-urgent`.

## Hors périmètre

- Le geste « renvoyer l'activation » depuis la console : fonction neuve, non validée.
- Les clés `errors.mail.invitation_not_sent` des fichiers de langue restent : leur retrait
  toucherait le fichier wolof, et elles sont sans effet.

## Notes d'implémentation

- Ablation : `AgencyProvisioningService.php` remis à `034d400b2` → le test de la panne du jeton
  rougit (« Expected 500 but received 502 ») ; correctif remis → 7 verts. Le test sous la file
  `database` est vert avant et après : il garde le contrat choisi, il ne reproduit pas le défaut.
- `Notification::assertNothingSent()` ne convient pas : la panne fait partir une
  `CodedNotification` d'exploitation ; on compte l'activation seule.

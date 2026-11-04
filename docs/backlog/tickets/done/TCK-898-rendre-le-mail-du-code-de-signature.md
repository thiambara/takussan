---
id: TCK-898
title: "Rendre le mail du code de signature de bail dans un test"
status: done
phase: P2
family: back
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-12--tests--zones-non-gardées-tests-verts-sans-leur-code"
tags: [back, tests, notifications, baux, pistes]
---

## Contexte

Réf : **P12.08** du fichier de pistes, `retenu · autonome` (A5).
`LeaseSignatureCodeNotification::toMail()` (TCK-596, ADR-0042 §2) est le seul endroit où le code
de signature part par e-mail, et aucun test ne l'appelle : les tests qui citent la notification
(`LeaseSignatureTest`, `MobileClassEventsTest`, `AmbiguousSmsFailureTest`) la figent par
`Notification::fake()` sans la rendre. Re-mesuré le 2026-10-18 : `grep toMail` sur ces trois
fichiers → rien.

## Objectif utilisateur

Un locataire sans numéro vérifié reçoit par e-mail le code qui signe son bail, et un mail rendu
sans ce code rougit un test.

## Contrat de données

Aucun changement : le test décrit le contrat existant.

## Contraintes strictes

- Aucun code de production modifié.

## Delta à produire

- [x] `tests/Unit/Notifications/LeaseSignatureCodeNotificationTest.php`

## Critères d'acceptation

- [x] AC1 — Sur le canal e-mail, `via()` rend `mail` seul, et le mail rendu contient le code, la
  référence du bail (objet et corps) et la durée de validité.
- [x] AC2 — Le mail rendu ne contient aucune clé de traduction brute
  (`notifications.lease_signature_code.…`).

## Hors périmètre

- Le canal SMS (`toSms`), déjà couvert.

## Notes d'implémentation

- Test seul, vert dès l'écriture : la reproduction est l'absence de tout appel à `toMail()` dans
  les tests qui citent la notification.
- Ablations, chacune remise après : la ligne `**<code>**` retirée de `toMail()` → rouge ; la ligne
  de validité retirée → rouge ; remis → vert.
- La validité s'asserte par la phrase traduite et échappée (`e(__(…))`), avec 37 minutes : un
  simple `15` se retrouvait dans le gabarit HTML du mail sans rien prouver.

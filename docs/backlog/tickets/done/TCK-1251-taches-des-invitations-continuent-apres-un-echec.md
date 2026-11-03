---
id: TCK-1251
title: "Les tâches horaires des invitations rattrapent un envoi qui échoue et traitent toutes les invitations"
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
tags: [back, invitations, scheduler, pistes]
---

## Contexte

Réf : **P123.04** du fichier de pistes, `retenu · autonome` (A1). Entrée dans le lot par l'angle 123,
dont P123.01 (TCK-1247) et P123.05 (TCK-1249) sont du lot ; elle cite aussi `InvitationService.php`,
que P123.01 cite.

`InvitationService::expire()` et `remindPending()` envoyaient sans `try` : le premier courriel qui
levait arrêtait la boucle.

## Objectif utilisateur

Une panne de courriel ne bloque plus l'expiration des invitations ni les rappels des autres invités.

## Contrat de données

Aucun endpoint.

## Contraintes strictes (métier)

- Une invitation expirée l'est même si l'avis à l'invitant échoue (comme avant pour la première).
- Un rappel qui échoue n'est pas marqué : il est retenté au passage suivant.

## Delta à produire

- [x] `expire()` : l'avis à l'invitant dans un `try`, échec rapporté.
- [x] `remindPending()` : l'envoi dans un `try`, échec rapporté, invitation non marquée.
  Voie retenue : rattraper par invitation, sans mettre `InvitationExpiredNotification` en file (la
  piste propose les deux ; le rattrapage seul suffit aux deux boucles et ne change pas la file).
- [x] `tests/Feature/Invitation/InvitationTachesEnPanneTest.php`.

## Critères d'acceptation

- [x] AC1 — trois invitations échues, transport qui lève : les trois passent `expired`, trois
  avis tentés.
- [x] AC2 — trois rappels dus, transport qui lève : trois tentatives, aucun marqué.

## Hors périmètre

- Un avis d'expiration perdu n'est pas renvoyé : l'invitation n'est plus `sent` au passage suivant.

## Notes d'implémentation

- Ablation : les deux `try` retirés → 2 rouges (`TransportException`), remis → 2/2.

---
id: TCK-1799
title: "Documenter ce que vaut `sms_sent: true` et ce qu'attrapent les `catch` « notification failed » autour d'un envoi en file"
status: done
phase: P3
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-179--trycatch-autour-dun-envoi-en-file-qui-promettent-un-repli"
tags: [api, notifications, documentation, visites, pistes]
---

## Contexte

Réf : **P179.04** du fichier de pistes, `retenu · autonome` (A6).

Le docblock de `VisitNotifier` dit « `true` parti » pour le sort du SMS, que l'API rend sous
`sms_sent` ; la valeur dit seulement que la borne n'a pas retenu le SMS, qui part ensuite en file
par `CodedNotification`. Les `catch` « notification failed » de `VisitNotifier`,
`ContactLeadService` et `GroupConversationService` entourent `NotificationService::send()`, qui
met en file : ils ne voient que l'avant-file, l'échec du transport se journalise au worker par
`CodedNotification::failed()`.

## Choix de l'implémenteur

La `Piste` propose de renommer la valeur (`sms_withheld`) ou de la documenter. **Retenue : la
documentation**, seule couverte par le classement A6 ; le renommage changerait le contrat que lit
le front.

## Objectif

Le code dit ce que fait le code : `true` vaut « non retenu, mis en file », et ces `catch` renvoient
vers `CodedNotification::failed()` pour l'échec du transport.

## Delta à produire

- [x] `VisitNotifier` : docblock de `confirmed()` et `@return` de `borneLeSms()` ; commentaires des
      `catch` de `toAgency()` et `toVisitor()`.
- [x] `PropertyVisitController::avecSortDuSms()` : docblock.
- [x] `ContactLeadService::assign()` et `dispatch()`, `GroupConversationService::sendInvites()` :
      commentaires des `catch`.

## Critères d'acceptation

- [x] AC1 — Aucun changement de comportement ni de réponse : seuls des commentaires changent.
- [x] AC2 — `SwallowedNotificationFailuresAreLoggedTest` et `GroupConversationCreationTest` verts.

## Reste à faire

- Le renommage de la clé `sms_sent` (`sms_withheld`), qui changerait le contrat lu par le front.

## Hors périmètre

- Faire voir l'échec du transport à l'appelant (P179.01, à valider).

## Notes d'implémentation

- Commentaires seuls : pas de test rouge possible, donc pas d'ablation. Les tests qui couvrent ces
  `catch` (TCK-771) ont été rejoués.

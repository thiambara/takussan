---
id: TCK-1123
title: "Les courriels de suppression de compte visent `/app/profile`, sans le paramètre mort `cancel-deletion=1`"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#56-accountdeletionrequest-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-97--liens-daction-des-courriels--page-visée-authentification-hôte"
tags: [back, notifications, account-deletion, pistes]
---

## Contexte

Réf : **P97.07** du fichier de pistes, `retenu · autonome` (A3 : paramètre sans lecteur des deux
côtés ; l'option « le faire lire » est écartée par le mesureur comme comportement visible neuf).

`AccountDeletionRequestedNotification` et `AccountDeletionReminderNotification` pointaient vers
`/app/profile?cancel-deletion=1`. Aucun fichier du front ne lit `cancel-deletion` : le bandeau
d'annulation est rendu sur toute page de `/app` tant qu'une demande est en cours
(`(dashboard)/layout.tsx`, `AccountDeletionBanner`).

## Objectif utilisateur

Rien ne change à l'écran : le lien du courriel ne porte plus de paramètre que rien ne lit.

## Contrat de données

Aucun endpoint.

## Contraintes strictes (métier)

- Le libellé du bouton et la page visée (`/app/profile`) sont inchangés.

## Delta à produire

- [x] Les deux `toMail()` : `/app/profile`.
- [x] `tests/Feature/Auth/AccountDeletionRequestTest.php::test_deletion_mails_link_to_the_profile_without_a_dead_parameter`.

## Critères d'acceptation

- [x] AC1 — l'`actionUrl` des deux courriels vaut `<app.frontend_url>/app/profile`.

## Hors périmètre

- L'écriture `config('app.frontend_url', config('app.url'))` de ces deux classes, dont le repli ne
  joue jamais : la fonction commune de P97.05.

## Notes d'implémentation

- Ablation : les deux classes rendues à `HEAD` → rouge sur la première ; la seule
  `AccountDeletionReminderNotification` rendue → rouge sur elle ; correctif remis → vert.
- Le cas à requête multiple de `proxy.test.ts` (TCK-1121) citait `cancel-deletion=1` : il prend un
  autre chemin, pour ne pas laisser croire qu'un lecteur existe.

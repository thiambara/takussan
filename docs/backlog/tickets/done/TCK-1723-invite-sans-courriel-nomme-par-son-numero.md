---
id: TCK-1723
title: "Les avis d'expiration et d'acceptation nomment l'invité sans e-mail par son numéro"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-155--courriels-que-la-suite-ne-rend-jamais"
tags: [back, invitations, notifications, pistes]
---

## Objectif utilisateur

L'invitant qui a invité quelqu'un par son seul numéro (connexion par téléphone, TCK-589) reçoit
« Votre invitation à +221… a expiré » et « +221… a accepté votre invitation », au lieu d'un texte
au nom vide.

## Contexte

Réf : **P155.03** du fichier de pistes, `validé` (critère V7 cité par le classement, accordé ; le
V3 relevé par le délégué est tranché par la validation, qui porte sa recommandation).

Mesuré avant correctif (test de garde ci-dessous, rouge sur `9f180a3ae`) : invitation `email` nul,
`phone` `+221771234567` → sujet de `InvitationExpiredNotification` « Your invitation to  has
expired » ; les deux avis lisaient `$invitation->email` sans repli.

## Décision du porteur

> validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

Recommandation du délégué, appliquée : nommer l'invité par `email`, sinon `phone`, dans un seul
accesseur de `Invitation` que les deux avis lisent, sans changer les textes de `lang/` et sans
repli sur `metadata.first_name`/`last_name`.

## Delta à produire

- [x] `Invitation::inviteeContact()` : `email ?? phone`.
- [x] `InvitationExpiredNotification` et `InvitationAcceptedNotification` le lisent.
- [x] Test : `tests/Feature/Invitation/InviteSansCourrielNommeDansLesAvisTest.php`.

## Critères d'acceptation

- [x] AC1 — Invitation par numéro seul : les deux avis portent le numéro (sujet et corps).
- [x] AC2 — Invitation avec adresse : l'adresse reste le nom, le numéro n'apparaît pas.

## Notes d'implémentation

- Ablation : les deux avis remis sur `$invitation->email` → 1 rouge (AC1) ; remis → 2 verts.

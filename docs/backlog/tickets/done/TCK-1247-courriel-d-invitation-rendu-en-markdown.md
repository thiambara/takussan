---
id: TCK-1247
title: "Le courriel d'invitation se rend en Markdown : il partait en 500, rappels compris"
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
tags: [back, invitations, mail, pistes]
---

## Contexte

Réf : **P123.01** du fichier de pistes, `retenu · autonome` (A1). Entrée dans le lot de l'angle 97
par sa famille : elle cite `InvitationMailable.php`, que P97.05 (TCK-1245) touche.

`InvitationMailable::content()` rendait `emails.invitation` par `view:`, alors que le gabarit est
écrit en composants `mail::`, que seul le rendu Markdown déclare.

## Objectif utilisateur

Une invitation par e-mail part, et son rappel aussi.

## Contrat de données

Aucun endpoint.

## Contraintes strictes (métier)

- Gabarit, sujet et lien d'acceptation inchangés.

## Delta à produire

- [x] `InvitationMailable::content()` : `markdown: 'emails.invitation'`.
- [x] `tests/Feature/Invitation/InvitationMailRenduTest.php` : mailer `array`, sans `Mail::fake()`.

## Critères d'acceptation

- [x] AC1 — `POST /api/agencies/{id}/agents/invite` envoie un courriel qui porte le lien
  d'acceptation.
- [x] AC2 — `remindPending()` envoie le rappel et pose `last_reminded_at`.
- [x] AC3 — le Mailable se rend sans composant brut.

## Hors périmètre

- `InvitationDeliveredAfterCommitTest` attendait son 500 de la `ViewException` : il reste vert,
  désormais par la `TransportException` qu'il simule.

## Notes d'implémentation

- Ablation : `view:` remis → 3 rouges (`No hint path defined for [mail]`), remis → 3/3.

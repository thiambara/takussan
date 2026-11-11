---
id: TCK-2726
title: "La demande d'un nouveau lien d'invitation va à qui peut encore la renvoyer"
status: todo
phase: P1
family: back
estimate: S
wave: 86
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2609]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#48-invitation-"
tags: [back, invitations, notifications, confidentialite, suivi-lot-1, decision-porteur]
---

## Objectif utilisateur

L'invité dont le lien a expiré demande un nouveau lien, et c'est quelqu'un de l'agence qui peut encore le lui renvoyer
qui est prévenu — jamais un ancien membre parti avec ses coordonnées.

## Contexte

Suivi de TCK-2609 (ADR-0094 §3). `InvitationRenewalRequests::request()` prévient **l'invitant d'origine**
(`$invitation->inviter`) par cloche et e-mail, avec le contact complet de l'invité (`params.invitee =
inviteeContact()`), **même s'il a quitté l'agence** ou perdu le droit d'inviter. Relevé de plus : la borne de 24 h
(`metadata.renewal_requested_at`) est posée **avant** le contrôle du destinataire ; sans invitant (compte supprimé), la
demande consomme la borne et ne prévient personne. `POST …/renewal-request` rend `202 {status: requested}` dans tous les
cas (pas d'oracle).

Qui peut renvoyer une invitation : `InvitationPolicy::resend` → `revoke` → `invitesAt()` (l'admin principal de
l'agence, ou `team.invite` dans l'agence) ; pour une invitation sans agence, l'invitant lui-même. ⚠ La branche de l'admin
principal se juge **par identifiant** (`primary_admin_id === user.id`), sans contrôle de personnel actif : la policy seule
ne suffit pas à dire « encore actif ».

## Décision

**Recommandation de session, à confirmer par le porteur ; si refusée → `obsolete`.**

- **a) (recommandé)** prévenir l'invitant s'il est encore **personnel actif** de l'agence de l'invitation
  (`PersonnelDeLAgence::personnelActifDe`) **et** peut la renvoyer (`InvitationPolicy::resend`) ; sinon, les membres
  du personnel actif de l'agence qui passent `resend` (admin principal et détenteurs de `team.invite`).
- b) statu quo : l'invitant d'origine, toujours.

## Contrat de données

- Destinataires de `InvitationRenewalRequested` : `[inviter]` s'il est personnel actif et passe `resend` ; sinon les
  membres du personnel actif de l'agence qui passent `resend`. Pour une invitation sans agence : l'invitant s'il existe,
  sinon personne. Le contenu de l'avis est inchangé.
- La borne de 24 h n'est consommée que si au moins un destinataire est prévenu ; sinon rien n'est écrit, et la réponse
  reste `202 {status: requested}`.

## Contraintes strictes (métier)

- Le jugement « peut renvoyer » est celui de la policy (une règle, un endroit), doublé du contrôle de personnel actif ;
  pas de liste des admins recopiée.
- Le coût de la résolution se mesure (équipe de 2 et de 10 membres) : s'il croît avec l'équipe, amorcer les capacités
  (`MembershipCapabilityResolver::primed`).
- Une invitation sans agence garde la règle de la policy (l'invitant lui-même) : s'il ne peut plus, personne n'est
  prévenu.
- La réponse HTTP ne dit jamais qui a été prévenu ni si quelqu'un l'a été.

## Delta à produire

- [ ] `InvitationRenewalRequests::request()` : résolution des destinataires avant d'écrire la borne, sous le même verrou.
- [ ] Tests : `InvitationRenewalRecipientsTest`.

## Critères d'acceptation

- [ ] AC1 — L'invitant I a quitté l'agence (profil retiré) ; l'admin principal P est actif : la demande de nouveau lien
      prévient P, et **aucune** notification n'est créée pour I.
- [ ] AC1 bis — L'invitant I est encore `primary_admin_id` de l'agence mais n'y est plus personnel actif (profil
      suspendu) ; un admin A2 tient `team.invite` : A2 est prévenu, I ne l'est pas.
- [ ] AC2 — L'invitant I est toujours personnel et tient `team.invite` : seul I est prévenu (comportement d'aujourd'hui).
- [ ] AC3 — Personne ne peut renvoyer (invitation sans agence dont l'invitant est supprimé) : 202, aucune notification,
      `metadata.renewal_requested_at` non posé.
- [ ] AC3 bis — Invitation d'agence dont personne ne passe la règle (seul admin suspendu) : 202, rien d'écrit ; l'admin
      réactivé, une nouvelle demande le prévient (la borne n'avait pas été consommée).
- [ ] AC4 — Deux demandes dans les 24 h avec destinataire : un seul avis (borne inchangée).
- [ ] AC5 — La résolution des destinataires coûte le même nombre de requêtes pour une équipe de 2 et de 10 membres.

## Hors périmètre

- `recipient_has_account` de l'aperçu (oracle faible, gardé par la session).
- Le masquage de l'e-mail au 401 de l'acceptation (TCK-2727).

## Notes d'implémentation

_(à remplir par implementing-specs)_

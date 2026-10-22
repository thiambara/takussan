---
id: TCK-1412
title: "La section /app/agency s'ouvre par capacité, délégations comprises, et la liste de l'équipe se lit sous la capacité qui ouvre la page Équipe"
status: done
phase: P1
family: bug
estimate: M
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-148--section-appagency-gardée-par-le-rôle-gestes-jugés-par-la-capacité"
tags: [front, api, agency, access, pistes]
---

## Contexte

Réfs : **P148.01** et **P148.02** du fichier de pistes, toutes deux `validé`. Même cause (la
section `/app/agency` juge `isAdmin(user.roles)`, qui ne lit que les profils) et même correctif :
elles partagent ce ticket.

- Un agent délégataire `agency_admin` reçoit de `GET /api/me/capabilities` toutes les capacités
  d'administration, mais `roles` de `/api/auth/me` vaut `["agent","customer"]` : le layout de la
  section le renvoie sur `/app`, et `GET /api/users` lui répond 403 (P148.01).
- Un agent dont le rôle personnalisé porte `team.invite` invite par l'API (201), mais la seule page
  qui porte le geste lui est fermée, et la liste de l'équipe lui est refusée (P148.02).

## Décision du porteur

- P148.01 : « la section se juge par capacité (`/api/me/capabilities`), délégations comprises ».
- P148.02 : « ouvrir la section `team` par capacité (`team.invite`, `team.assign_role` ou `team.suspend`), avec une liste d'équipe lisible sous la même capacité ».

Le critère accordé : V2 (P148.01, classement du mesureur), V7 (P148.02, classement du mesureur ;
le délégué y nommait aussi V2, que la décision du porteur tranche).

## Objectif utilisateur

Celui qui tient une capacité d'administration (par un rôle personnalisé ou une délégation) a
l'écran du geste que l'API lui permet déjà.

## Contrat de données

- `GET /api/users` (`UserAdminController::index`) : autorisé aussi à qui tient, dans l'agence du
  profil actif, `team.invite`, `team.assign_role` ou `team.suspend` (`canActAt`, délégations
  comprises). Portée inchangée : les membres de cette agence.

## Delta à produire

- [x] `PAGES_ADMIN` : `ExigenceAdmin.ouvertePar`, les capacités qui ouvrent la page à un profil
  sans rôle d'administration. `team` : `team.invite`, `team.assign_role`, `team.suspend` ;
  `roles` : `team.assign_role` ; `kyc` : `agency.update_kyc`. `pageAccessible` les lit ;
  l'exigence `standard` et la `capacite` valent pour lui comme pour l'admin.
- [x] `pages-admin-server` : les capacités sont lues pour tout compte rattaché à une agence, et
  la garde d'une page les lit pour un non-admin.
- [x] Layout de la section : un non-admin passe s'il a au moins une page de la table.
- [x] Page Équipe : `estAdmin` passé à `InviteMemberButton` et `TeamConsole`. Sans rôle d'admin,
  « Inviter » exige `team.invite`, « Ajouter un compte existant » et le « Ajouter » de l'état
  vide disparaissent (`AgencyPolicy::update`, jugé par le profil), « Retirer de l'agence » exige
  `team.remove` (`AgencyPolicy::removeMember`).
- [x] API : `UserAdminController::index` ouvert aux trois capacités d'équipe.
- [x] Tests : `pages-admin.test.ts`, `pages-admin-server.test.ts`, `layout.acces.test.tsx`,
  `InviteMemberButton.test.tsx`, `TeamConsole.suspension.test.tsx`,
  `UserAdminCapabilityAccessTest.php`.

## Critères d'acceptation

- [x] AC1 — Un délégataire `agency_admin` ouvre `/app/agency/team`, `/roles` et `/kyc`, et ces
  entrées sont à son menu ; aucune autre page de la section.
- [x] AC2 — Un agent au rôle portant `team.invite`, `team.assign_role` ou `team.suspend` ouvre
  `/app/agency/team` (agence `standard`), et `GET /api/users` lui rend les membres de son agence.
- [x] AC3 — Un agent sans ces capacités reste renvoyé, et `GET /api/users` lui rend 403.
- [x] AC4 — L'admin d'agence et le super-admin gardent exactement leur accès d'avant.

## Hors périmètre

- Les pages dont l'API juge la lecture par le profil d'admin (`/app/agency`, `finances` et son
  rapprochement, `moderation`, `moderation/properties`, `audit`, `integrations`) restent fermées
  à un non-admin : les ouvrir n'afficherait que leur état d'erreur. Leur conversion relève de
  P116.02 (fiche, réglages, intégrations par `agency.update`), P116.05 et P116.07.
- `AgencyPolicy::update`, que la Piste de P148.01 propose d'aligner : c'est le correctif de
  P116.02 (`validé`), qui la juge par `agency.update`. Ici, un délégataire n'a donc ni
  « Ajouter un compte existant » ni `GET /api/agencies/{id}/members`.
- `/app/agency/billing` : la lecture des reversements est jugée par capacité, mais celle de
  l'abonnement (`GET /api/me/subscription`) n'a pas été confrontée ; la page reste au rôle.
- La liste des invitations en attente, que `InvitationPolicy::viewAny` juge par le profil : un
  agent qui tient `team.invite` voit la zone vide (P116.03, `retenu · à valider`).

## Notes d'implémentation

- Le layout garde son `isAdmin(user.roles)` comme voie rapide (aucune lecture pour un admin) :
  `check-auth-interrupts` l'inventorie, et la population ne change pas.
- La lecture des capacités par rendu (`capacitesDuRendu`, `cache()`) se fait désormais aussi pour
  un agent ou un bailleur rattaché à une agence : une requête de plus par rendu de `/app` pour
  eux. `capacitesAmorcees` n'amorce toujours que l'admin.
- Ablation, fichier par fichier rendu à `HEAD` : `UserAdminController.php` → 3 rouges sur 4 ;
  `pages-admin.ts` → 6 rouges ; `pages-admin-server.ts` → 2 ; `layout.tsx` → 1 ;
  `InviteMemberButton.tsx` → 2 ; `TeamConsole.tsx` → 1. Correctifs remis → tout vert.

---
id: TCK-2280
title: "Une invitation acceptée par un compte existant : rôle annoncé, compte désigné par son numéro, téléphone et métiers dits à l'agence"
status: doing
phase: P1
family: bug
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#48-invitation-"
  adr:
    - "docs/adr/0016-role-agence-du-prestataire-porte-par-la-collaboration.md#amendement-du-2026-10-25--un-seul-profil-de-prestataire-par-compte-tenu-par-le-code"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-234--ce-que-linvitation-porte-face-à-lacceptation-par-un-compte-existant"
tags: [api, web, invitations, equipe, prestataires, bailleurs, telephone, pistes]
---

## Contexte

Pistes : P234.01, P234.02, P234.03, P234.04, P234.05, P234.07

Réfs : **P234.01**, **P234.02**, **P234.04** et **P234.05** (`validé`), **P234.03** et **P234.07**
(`retenu · autonome`) du fichier de pistes, angle 234. P234.06 (raison sociale sur les documents)
n'en fait pas partie.

L'angle relevait ce que l'invitation porte quand un compte **existant** l'accepte :

- **P234.01** — le rôle choisi à l'invitation d'un agent (`agent_senior`, `agent_manager`) n'était
  jamais appliqué : le membre entrait comme simple agent, et la liste des invitations en attente
  affichait un rôle qu'il n'aurait pas.
- **P234.02** — une invitation de prestataire par numéro, acceptée par un compte qui avait déjà un
  profil de prestataire, lui créait un second profil, que `me/profiles` et
  `me/service-provider/collaborations` ne voyaient pas.
- **P234.03** — un bailleur ou un agent déjà membre, invité de nouveau par son numéro, recevait
  le SMS (201) puis tombait en 500 à l'acceptation, sur `unique(user_id, agency_id)`.
- **P234.04** — le téléphone saisi par l'agence à l'invitation n'atteignait jamais le compte, et
  le docblock d'`AgentInvitationService` annonçait le contraire.
- **P234.05** — un prestataire déjà inscrit, invité par une seconde agence, gardait ses métiers :
  ceux que l'agence avait saisis étaient jetés sans le lui dire.
- **P234.07** — les accesseurs `display_name` des trois profils rendaient `''` pour un compte lié
  sans nom, et `DeleteRoleDialog` n'attrapait que `null`.

## Décision du porteur

- **P234.01** — validation du porteur (2026-10-25) : `agent_senior` et `agent_manager` retirés du dialogue et d'`ALLOWED_ROLES`, les invitations déjà émises restant acceptées
- **P234.02** — validation du porteur (2026-10-25) : le profil existant est cherché par `recipientAccount` (e-mail ou numéro vérifié), et l'acceptation d'un second profil de prestataire est refusée par un 409 nommé
- **P234.04** — validation du porteur (2026-10-25) : le numéro saisi devient une donnée de la fiche d'agence, rendue dans les carnets ; docblock corrigé
- **P234.05** — validation du porteur (2026-10-25) : la réponse et le toast nomment les métiers retenus, ceux du profil

P234.03 et P234.07 sont `retenu · autonome` (A1) : elles suivent leur `Piste`.

## Hypothèses

- **P234.02 / P234.03** — le refus de l'acceptation ne compte que les profils non retirés : un
  profil retiré (`SoftDeletes`) n'est plus membre. `unique(user_id, agency_id)` le compte encore,
  et un membre retiré puis ré-invité n'est pas couvert ici (voir « Hors périmètre »).
- **P234.02** — le même compte destinataire sert au refus « déjà rattaché à l'agence » (409) à
  l'invitation : il valait par e-mail, il vaut aussi par numéro.
- **P234.04** — « les carnets » sont celui des bailleurs et celui des prestataires. Le numéro y est
  une colonne. Pour un prestataire déjà inscrit (profil réutilisé), le numéro saisi par la seconde
  agence n'est rangé que sur l'invitation : il n'a pas de fiche propre à l'agence où vivre.

## Delta à produire

- [ ] P234.01 — API : `AgentInvitationService::ALLOWED_ROLES` = `['agent']`. Les autres restent
      dans `INVITABLE_TYPE_BY_ROLE` et la liste de `finalizeAccept`, pour les invitations déjà
      émises. Front : le dialogue n'offre plus le choix du rôle.
- [ ] P234.02 — `ServiceProviderInvitationService` cherche le profil par
      `InvitationService::recipientAccount()`, devenu public. `finalizeAccept` refuse en 409
      `invitation.service_provider_profile_exists` le lien d'un brouillon à un compte qui a déjà
      un profil de prestataire. Amendement d'ADR-0016.
- [ ] P234.03 — les services de bailleur et d'agent jugent « déjà membre » sur le compte qui a
      vérifié le numéro. `finalizeAccept` refuse en 409 `invitation.already_member`.
- [ ] P234.04 — le carnet des bailleurs et celui des prestataires rendent le numéro saisi
      (`metadata.phone`). Le carnet des prestataires laisse passer cette sous-clé. Les docblocks
      des services d'agent et de bailleur sont corrigés.
- [ ] P234.05 — la réponse de l'invitation de prestataire porte `meta.retained_trades`, les métiers
      du profil. Le toast d'un prestataire déjà inscrit les nomme.
- [ ] P234.07 — les trois `display_name` retombent sur `metadata` quand le nom du compte est vide.
      `DeleteRoleDialog` teste la vacuité.

## Critères d'acceptation

- [ ] Une invitation `agent_manager` ou `agent_senior` rend 422. Une invitation `agent_manager`
      déjà émise s'accepte toujours (200).
- [ ] Un bailleur ou un agent de l'agence, invité par son numéro, rend 409 à l'invitation. Un
      brouillon accepté par un compte devenu membre entre-temps rend 409
      `invitation.already_member`, jamais 500, et l'invitation reste `sent`.
- [ ] Un prestataire invité par son numéro par une seconde agence garde un seul profil. La
      collaboration de cette agence est sur ce profil, et visible dans
      `me/service-provider/collaborations`. Un brouillon accepté par un compte qui a déjà un profil
      rend 409 `invitation.service_provider_profile_exists`.
- [ ] Le carnet des bailleurs et celui des prestataires montrent le numéro saisi à l'invitation.
- [ ] La réponse de l'invitation d'un prestataire déjà inscrit nomme ses métiers, et le toast les dit.
- [ ] Un profil lié à un compte sans nom rend le nom de `metadata`. Le dialogue de suppression d'un
      rôle retombe sur son libellé quand le nom est vide.

## Hors périmètre

- P234.06 (raison sociale sur le bail, le relevé, l'état des lieux et le reversement).
- Le membre retiré (profil `SoftDeletes`) puis ré-invité : `unique(user_id, agency_id)` compte la
  ligne retirée, et l'acceptation rend encore 500. Mesuré le 2026-10-25 par un test temporaire
  (retiré) : agent retiré, ré-invité par e-mail → 201, acceptation → 500.

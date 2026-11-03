---
id: TCK-626
title: "Le lien d'invitation (e-mail et SMS) menait à une 404 : /invitations/accept n'avait pas de page, et l'acceptation aucun appelant"
status: done
phase: P1
family: front
estimate: S
wave: null
created: 2026-10-10
updated: 2026-10-10
depends_on: [TCK-249, TCK-624]
blocks: []
spec_refs:
  features:
    - docs/features.md
  models: []
tags: [front, invitations, onboarding, agent, proprietaire, prestataire]
---

## Objectif utilisateur

- **Toute personne invitée** (agent, propriétaire, prestataire, super-admin) : ouvrir le lien reçu
  et arriver dans son assistant, avec ou sans compte.

## Contexte (relevé le 2026-10-10)

- `InvitationMailable` et le SMS d'invitation (`InvitationService`) pointent sur
  `/invitations/accept?token=…` : aucune page front ne la servait (404, après une redirection de
  langue, `invitations` n'étant pas un segment non localisé).
- `POST /api/invitations/{token}/accept` est public (TCK-249), avec session optionnelle ; aucun
  code front ne l'appelait.

## Décision

- Page `app/invitations/accept` (`OnboardingShell`) ; `invitations` rejoint
  `SEGMENTS_NON_LOCALISES`.
- **Connecté** : un bouton « Accepter l'invitation ». **Déconnecté** : prénom, nom (facultatif),
  mot de passe ; le compte naît de l'invitation, la session s'ouvre avec ce mot de passe (une
  invitation par SMS, sans e-mail, passe par la connexion). « J'ai déjà un compte » et le 401
  `requires_login` mènent à la connexion, qui ramène ici.
- Destination : l'assistant du profil activé, **avec son identifiant** (`?owner=`, `?agent=`,
  `?sp=`), sans quoi l'assistant ne retrouve pas un profil déjà passé à `active`.

## Critères d'acceptation

- [x] Connecté : l'acceptation mène à `/onboarding/agent?agent=12` (`AccepterInvitation.test.tsx`).
- [x] Déconnecté : prénom/nom/mot de passe envoyés, session ouverte, assistant du propriétaire.
- [x] Compte existant : message et lien de connexion qui revient à l'invitation.
- [x] Chaque rôle mène au bon assistant (`destinationDInvitation`).

## Hors périmètre

- Afficher « X vous invite chez Y » avant d'accepter, et refuser une invitation : il faut deux
  endpoints neufs (lecture par jeton, refus).

## Vérification

- `src/app/invitations/accept/__tests__/AccepterInvitation.test.tsx` (9 cas), `src/i18n`,
  `proxy.test.ts` : verts. `tsc`, ESLint, `check:i18n` : verts.

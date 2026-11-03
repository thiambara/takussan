---
id: TCK-1203
title: "Un geste protégé par la 2FA affiche « code requis » sans champ pour le saisir : 31 appels hors de la garde, et l'entrée de la console"
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
    - docs/features.md#21-authentification--comptes
    - docs/features.md#29-administration--configuration
    - docs/features.md#112-agence--équipe
  models:
    - docs/models-spec.md#1-user
tags: [front, auth, 2fa, step-up, super-admin, agence, adr-0033]
---

## Constat

Signalé par le porteur le 2026-10-22 : enregistrer les paramètres généraux de la console
super-admin affiche qu'il faut envoyer le code 2FA, sans jamais offrir de champ pour le saisir.

L'API refuse les gestes protégés (`ProtectedActions` : `STEP_UP`, `STEP_UP_FOR_PLATFORM`,
`AGENCY_TWO_FACTOR`, `PLATFORM_TWO_FACTOR`) par un 403 qui porte `two_factor_required` ou
`two_factor_step_up_required`. Le front sait résoudre ce refus sur place depuis TCK-589 — la garde
`GardeDoubleFacteur`, montée par les layouts `(dashboard)` et `(super-admin)`, demande le code puis
rejoue — mais **seulement** pour un appel passé par `useApiMutation`, `avecGardeDoubleFacteur` ou
`avecGardeDoubleFacteurAction`. Un relevé de chaque action protégée et de ses appelants a trouvé
31 appels qui contournaient la garde (un `useMutation` nu, un `apiRequest` dans un `onSubmit`) :

- **console super-admin** (step-up) : paramètres généraux, intégrations (modifier, tester),
  drapeaux de fonction (modifier, forcer), clôture et gestes des reversements plateforme
  (approuver, marquer payé, annuler), invitation, relance, révocation d'opérateurs, support
  utilisateur (déverrouiller, réinitialiser la 2FA, révoquer les sessions, fermer une session),
  cycle de vie d'un compte (bloquer, réactiver, effacer) ;
- **console d'agence** (2FA d'agence ou step-up) : restitution de caution, rôle d'un utilisateur,
  ajout et retrait d'un membre, passation de portefeuille, suspension d'équipe, absences,
  invitations de bailleur et de prestataire, relance et révocation d'invitations (trois écrans),
  modération des biens et des avis par un profil plateforme ;
- **profil** : régénérer les codes de secours et renouveler l'appareil TOTP — l'action serveur
  perdait en plus le `code` du refus (`app/actions/security.ts`).

Et à l'**entrée de la console** : `EnsureSuperAdmin` exige la 2FA à tout niveau, mais le layout
ne détourne vers l'enrôlement que le rôle `super_admin`. Un opérateur `viewer` ou `support` sans
2FA, ou un jeton qui ne l'a pas vue, recevait un 403 de `GET /api/admin/me/abilities`, lu comme
« pas d'opérateur » : renvoi vers `/app`, sans un mot.

## Correctif

1. Chaque appel passe par `avecGardeDoubleFacteur` (ou `avecGardeDoubleFacteurAction`) avec la
   garde du contexte ; les actions de `security.ts` rendent le `code` du refus.
2. `fetchPlatformAbilities` distingue le refus de second facteur (`{ doubleFacteur: code }`) ; le
   layout rend alors `EntreeConsoleDoubleFacteur` : l'enrôlement exigé, ou la saisie du code récent
   (`PreuveRecente`, désormais exportée par `GardeDoubleFacteur`) suivie d'un `router.refresh()`.

## Critères d'acceptation

- [x] Pour chaque écran corrigé, un test rend l'appel refusé une fois par
      `two_factor_step_up_required` (ou `two_factor_required`) : la garde reçoit le code, l'appel
      est rejoué et aboutit ; une garde refusée laisse l'erreur affichée.
- [x] Vérification par ablation : un appel rendu à sa forme d'origine fait rougir son test.
- [x] Un opérateur dont l'entrée est refusée faute de second facteur voit l'enrôlement ou la saisie
      du code, jamais un renvoi silencieux vers `/app` (test du layout et du composant).

## Hors périmètre

Aucune garde automatique n'empêche un appel neuf vers une route protégée de contourner la garde :
le relevé a été fait à la main. Une garde qui croise `ProtectedActions` et les appelants du front
est un ticket à part si on la veut.

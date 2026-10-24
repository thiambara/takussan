---
id: TCK-2160
title: "Activer ou couper le second facteur au profil relit le compte"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-202--gestes-qui-changent-apiauthme-sans-relire-le-contexte-dauthentification"
tags: [web, auth, 2fa, profil, pistes]
---

## Objectif

Après la confirmation ou la coupure du second facteur, `useAuth().user.two_factor_enabled` dit
l'état du serveur, et le dialogue de suppression du compte demande le code, ou non, en conséquence.

## Contexte

Réf : **P202.02** du fichier de pistes, `validé` (critère V2 accordé). `TwoFactorSection` ne posait
que son état local ; `ProfileSecuritySection` passe le drapeau du contexte au dialogue de
suppression, qui n'affiche et n'envoie `two_factor_code` que s'il est vrai, alors que l'API l'exige
dès que `users.two_factor_enabled` est vrai (`RequestAccountDeletionRequest`).

## Décision du porteur

correctif local : `refreshUser()` à la confirmation et à la coupure du second facteur, comme P202.04 (TCK-2042), avec le test de la piste sous un vrai `AuthProvider` ; l'API reste juge du code

## Hypothèses (mode sans humain)

- La relecture se fait après la mise à jour de l'état local de la section : les codes de
  récupération, montrés une seule fois, restent affichés (la section n'est pas remontée).

## Delta à produire

- [x] `TwoFactorSection` : `await refreshUser()` après une confirmation réussie et après une
  coupure réussie.
- [x] Test de `ProfileSecuritySection` sous un vrai `AuthProvider`.

## Critères d'acceptation

- [x] AC1 — Second facteur confirmé : le dialogue de suppression affiche « Code 2FA (6 chiffres) »,
  et les codes de récupération restent à l'écran.
- [x] AC2 — Second facteur coupé : le dialogue de suppression n'affiche plus ce champ.

## Hors périmètre

- La cause commune (le contexte qui ne suivait pas la mise en page) : TCK-2158.
- Le renouvellement et la régénération des codes, qui ne changent pas `two_factor_enabled`.

## Notes d'implémentation

- Test : `takussan-web/src/components/profile/__tests__/ProfileSecuritySection.second-facteur.tck-2160.test.tsx`
  (`/api/auth/me` simulé rend l'état du serveur après le geste). Avant correctif : 2 rouges (champ
  absent après activation, présent après coupure).
- Ablation : `TwoFactorSection.tsx` à `HEAD` → 2 rouges ; remis → vert.

---
id: TCK-2046
title: "Le nom et la photo changés dans l'en-tête du profil entrent au contexte d'authentification"
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
tags: [web, profil, pistes]
---

## Objectif

Après un enregistrement dans l'en-tête du profil, `useAuth().user` porte le nouveau nom et la
nouvelle photo, que lit la `Navbar` du site public.

## Contexte

Réf : **P202.06** du fichier de pistes, `retenu · autonome` (A1). Contrat écrit par
`EtapePrenom`, qui pose `setUser({ ...user, ...resultat.user })` après le même enregistrement.

- `ProfileHeader` posait l'utilisateur rendu dans un état local puis `router.refresh()`, qui ne
  change pas le contexte (P202.01).

## Delta à produire

- [x] `ProfileHeader` pose l'utilisateur rendu au contexte, fusionné sur celui du contexte, comme
  `EtapePrenom`.
- [x] Test sous un vrai `AuthProvider`.

## Critères d'acceptation

- [x] AC1 — Enregistrement réussi : `useAuth().user` porte le nouveau prénom, le nom complet et la
  photo, et garde ce que l'en-tête n'a pas touché.

## Hors périmètre

- La cause commune de l'angle (P202.01, à valider).

## Notes d'implémentation

- Test : `takussan-web/src/components/profile/__tests__/ProfileHeader.contexte.tck-2046.test.tsx`.
  Avant correctif : rouge (`first_name` resté `Astou`).
- Ablation : `ProfileHeader.tsx` à `HEAD` → rouge ; remis → vert.

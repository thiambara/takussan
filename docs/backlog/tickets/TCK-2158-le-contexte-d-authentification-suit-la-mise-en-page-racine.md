---
id: TCK-2158
title: "Le contexte d'authentification suit l'utilisateur que rend la mise en page racine"
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
tags: [web, auth, contexte, pistes]
---

## Objectif

Un `router.refresh()`, ou une action serveur, qui fait rendre au layout racine un nouvel
utilisateur ou un nouveau jeton met à jour `useAuth()`.

## Contexte

Réf : **P202.01** du fichier de pistes, `validé` (critère V2 accordé). `AuthProvider` posait `user`
et `token` par `useState(initialUser)` et `useState(initialToken)`, une seule fois : le layout
racine relit `/api/auth/me` à chaque rendu serveur, mais l'état ignorait la nouvelle propriété.

## Décision du porteur

`AuthProvider` suit `initialUser` quand il est non nul et ne vide le compte que si `initialToken` passe aussi à `null` ; un `null` avec un jeton présent (échec ou délai de `/me`) garde le compte, comme TCK-1992

## Hypothèses (mode sans humain)

- « De même pour `initialToken` » (la `Piste`) : un jeton neuf rendu par le layout se pose, le
  cookie faisant foi. Un jeton qui passe à `null` sous un utilisateur non nul (impersonation, où le
  layout ne transmet aucun jeton) se pose aussi ; l'impersonation recharge de toute façon la page.
- Seul ce qui **change** dans les propriétés s'applique : tant que le layout ne rend rien de neuf,
  ce que le client a posé (`setUser`, `openSession`, `logout`) reste. C'est le patron du profil
  actif (`profilDuLayout`, TCK-2050), dans le même composant.

## Delta à produire

- [x] `AuthProvider` : état dérivé de `initialUser` et `initialToken` (valeur du rendu précédent
  comparée à la nouvelle, posée pendant le rendu).
- [x] Test d'`AuthProvider` re-rendu sous d'autres propriétés.

## Critères d'acceptation

- [x] AC1 — Re-rendu avec un autre `initialUser` : `useAuth().user` est le nouveau compte.
- [x] AC2 — Re-rendu avec `initialUser = null` sous le même jeton : le compte reste.
- [x] AC3 — Re-rendu avec `initialUser = null` et `initialToken = null` : compte et jeton vidés.
- [x] AC4 — Re-rendu avec un jeton neuf : `useAuth().token` le suit.
- [x] AC5 — Un `setUser` du client n'est pas écrasé par un re-rendu aux mêmes propriétés.

## Hors périmètre

- Le cache React Query d'un compte remplacé par un autre via le layout (sans `openSession`) : non
  vidé ici ; le cas suppose un cookie changé hors du chemin unique d'entrée.
- Les gestes de P202.02 et P202.07, traités par TCK-2160 et TCK-2162.

## Notes d'implémentation

- Test : `takussan-web/src/context/__tests__/AuthContext.suit-la-mise-en-page.tck-2158.test.tsx`.
  Avant correctif : 3 rouges sur 5 (AC1, AC3, AC4 : `Awa|customer|false#jeton-1` rendu à chaque
  fois).
- Ablation : `AuthContext.tsx` à `HEAD` → 3 rouges ; remis → 5 verts.
- Les cinq fichiers de test hors `src/context` qui montent un vrai `AuthProvider` (`Navbar` ×2,
  `ReinitialiserSessionClient`, TCK-2040, TCK-2046) restent verts.

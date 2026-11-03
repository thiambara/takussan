---
id: TCK-1374
title: "La mise en page racine lit l'utilisateur par la promesse de `getMeAction`, sous le profil actif"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-138--lectures-de-lapi-dédoublées-dans-un-même-rendu-serveur"
tags: [web, auth, performance, pistes]
---

## Contexte

Réfs : **P138.03** (🔴) et **P138.02** (🟠) du fichier de pistes, toutes deux `validé`, même cause
et même correctif. La mise en page racine appelait `getMe(jeton)` sans indice de profil et hors de
`cache()` : deux `GET /api/auth/me` par document de `/app` et `/super-admin`, et un `user` remis à
`AuthProvider` lu par auto-bascule, donc `agency_id: null` pour un compte de plusieurs agences.

## Décision du porteur

> P138.03 : validé — porteur (2026-10-22) : l'utilisateur de la racine se lit sous le profil actif (`getActiveProfileId()`, ou la promesse de P138.02)

> P138.02 : validé — porteur (2026-10-22) : la racine lit l'utilisateur par la même promesse mémoïsée que `getMeAction` ; un seul `/api/auth/me` par document

## Delta à produire

- [x] `src/lib/utilisateur-du-rendu.ts` : `utilisateurDuRendu`, sous `cache()`, jeton de
      `getToken()` et indice de `getActiveProfileId()` ; `null` sans jeton, rejet sur erreur.
- [x] `getMeAction` lit par elle (redirection 401 et sans jeton inchangées).
- [x] La racine lit par elle, bornée par `DELAI_ME_RACINE_MS` (course contre le signal), repli
      anonyme sur toute erreur, sans redirection.
- [x] `getMeOperateurAction` : hors impersonation (jeton de l'opérateur = jeton applicatif), la
      même lecture ; pendant une impersonation, sa lecture propre, inchangée.
- [x] Garde : `src/app/__tests__/layout-racine.utilisateur-du-rendu.test.tsx`.

## Critères d'acceptation

- [x] AC1 — La racine appelle `/api/auth/me` avec l'indice du cookie `active_profile_id`.
- [x] AC2 — Racine + `getMeAction` (et racine + console hors impersonation) : un seul appel.
- [x] AC3 — Impersonation : la racine lit la cible sans indice, la console l'opérateur.
- [x] AC4 — Un 401 rend la racine anonyme ; `getMeAction` redirige toujours vers `session-expired`.

## Hors périmètre

- Ce que chaque composant client qui lit `useAuth().user.agency_id` montrait à un compte de
  plusieurs agences avant le correctif (non rendu).

## Hypothèses

- Hors impersonation, `getOperatorActiveProfileId()` et `getActiveProfileId()` lisent le même
  cookie (lu, `src/lib/session.ts`) : la console peut partager la lecture.

## Notes d'implémentation

- La borne de la racine ne passe plus de `signal` à `getMe` : abandonner la lecture partagée la
  ferait échouer aussi pour `getMeAction`. Elle la met en course ; au-delà de 5 s, la racine se
  rend anonyme et la coque attend la même promesse, comme avant.
- `cache()` ne mémoïse que sous `react-server` : le test le remplace par une mémoïsation par rendu.
- Ablation : la racine rendue à `getMe(jeton)` direct → 4 rouges sur 6 (indice absent, deux
  appels) ; remis → 6 verts, et 8 avec `layout-racine.get-me-borne.test.tsx`.

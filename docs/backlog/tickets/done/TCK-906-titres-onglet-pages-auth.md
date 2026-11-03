---
id: TCK-906
title: "Pages d'authentification : un titre d'onglet par page"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#28-internationalisation--préférences"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#les-six-pages-dauthentification-portent-le-même-titre-donglet"
tags: [front, a11y, auth, i18n, pistes]
---

## Contexte

Réf : **P31.06** du fichier de pistes, `validé` (V7 accordé).

`(auth)/layout.tsx` pose le modèle « %s — Takussan » et le défaut « Authentification — Takussan » ;
aucune page de `(auth)/auth/` ne remplit le modèle (toutes sont `'use client'`). Connexion,
inscription et mot de passe oublié portent donc le même titre d'onglet.

## Décision du porteur

validé — libellés d'onglet courts et neufs (Connexion, Inscription, Mot de passe oublié, Nouveau mot de passe, Vérification de l'e-mail) ; en `wo`, le texte français tel quel ; un test par page

## Objectif utilisateur

Un visiteur distingue, dans ses onglets, son historique ou son lecteur d'écran, la page de connexion
de celle du mot de passe oublié.

## Delta à produire

- [x] Clés `auth.meta.titles.{login,register,forgotPassword,resetPassword,verifyEmail}` : les cinq
  libellés de la décision en `fr`, leur traduction en `en`, le texte français tel quel en `wo`.
- [x] Un `layout.tsx` serveur par segment (`login`, `register`, `forgot-password`,
  `reset-password`, `verify-email`), qui ne pose que le titre, par un même assistant.
- [x] Un test par page.

## Critères d'acceptation

- [x] AC1 — Chacune des cinq pages a son titre, que le modèle du groupe complète par « — Takussan ».
- [x] AC2 — Le titre de `verify-email` couvre aussi `verify-email/[id]/[hash]`.
- [x] AC3 — `wo` porte le texte français tel quel.

## Hors périmètre

- Le rappel OAuth (`auth/oauth/[provider]/callback`), que la décision ne nomme pas : il garde le
  titre par défaut.
- Le texte `wo` (wolof en pause depuis le 2026-10-16).

## Notes d'implémentation

- **Reproduction** : `titres-d-onglet.test.ts` → rouge, aucun `layout.tsx` de segment.
- **Ablation** : clés `fr` retirées, layouts gardés → 5 rouges (le titre rend le chemin de clé) ;
  remises → `src/app/(auth)`, 48 verts.
- Hypothèse : traductions anglaises « Sign in », « Sign up », « Forgot password », « New
  password », « Email verification », sur le modèle des libellés anglais existants.
- **Piège** : un `layout.tsx` est une frontière de dictionnaire pour `check:i18n-namespaces`, qui
  exige alors `messagesPour`. Les layouts de segment rendent exactement `<>{children}</>` et
  n'appellent aucune API de traduction eux-mêmes (le titre passe par `titre-d-onglet.ts`) : la garde
  les tient pour transparents (exemption de TCK-426), et ils héritent du dictionnaire de `(auth)`.

---
id: TCK-896
title: "Pages d'authentification : un repère <main> sur le panneau du formulaire"
status: doing
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
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#les-pages-dauthentification-nont-pas-de-repère-main"
tags: [front, a11y, auth, pistes]
---

## Contexte

Réf : **P31.03** du fichier de pistes, `retenu · autonome` (A4).

`AuthPanneau` (`src/app/(auth)/layout.tsx`) rend une grille de `div` : le formulaire est dans un
`div`, sans `<main>`, et aucune page de `(auth)/auth/` n'en ajoute. axe relève
`landmark-one-main` et `region` sur les cinq pages d'authentification.

## Objectif utilisateur

Un visiteur au lecteur d'écran saute directement au formulaire de connexion, d'inscription ou de
réinitialisation.

## Delta à produire

- [x] `(auth)/layout.tsx` : le panneau du formulaire devient un `<main>` ; le panneau visuel
  reste hors du repère.
- [x] Test : le layout rend un seul `main`, qui contient le formulaire et pas le panneau visuel.

## Critères d'acceptation

- [x] AC1 — Le layout rend un seul `main`, qui contient la page.
- [x] AC2 — Le titre du panneau visuel est hors du `main`.
- [x] AC3 — Aucun rendu visuel ni texte neuf : l'élément garde ses classes.

## Hors périmètre

- Le lien d'évitement (P31.04).
- Les titres d'onglet des pages d'authentification (P31.06).

## Notes d'implémentation

_(à remplir par implementing-specs)_

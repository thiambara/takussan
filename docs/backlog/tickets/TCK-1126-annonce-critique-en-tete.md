---
id: TCK-1126
title: "Les annonces actives sortent de la plus grave à la moins grave, la critique en tête"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-98--écrans-décriture-de-la-console-super-admin--ce-quils-changent-hors-de-la-console"
tags: [back, announcements, super-admin, pistes]
---

## Contexte

Réf : **P98.02** du fichier de pistes, `retenu · autonome` (A1 : le tri descendant sur la gravité
dit l'intention du code, et l'enum `AnnouncementSeverity` en donne l'ordre).

`AnnouncementResolver::activeFor()` triait par `orderByDesc('severity')` sur une colonne texte :
`warning, success, info, critical`. Le bandeau ne rend que la première annonce, et une annonce
critique, qu'on ne peut pas fermer, restait cachée derrière toute autre.

## Objectif utilisateur

Une annonce critique s'affiche dans le bandeau dès qu'elle est active pour l'utilisateur.

## Delta à produire

- [x] `AnnouncementResolver::activeFor()` trie sur le rang des cas de `AnnouncementSeverity`,
      du plus grave au moins grave, puis `starts_at`.
- [x] Test dans `AnnouncementTest`.

## Critères d'acceptation

- [x] AC1 — quatre annonces `info`, `success`, `critical`, `warning` sortent de
      `/api/announcements/active` dans l'ordre `critical`, `warning`, `success`, `info`.

## Hors périmètre

- Rendre toutes les annonces dans le bandeau (comportement visible neuf, V7) : le bandeau ne
  change pas.

## Notes d'implémentation

- Ablation : `AnnouncementResolver.php` rendu à `pre-dev` → 1 rouge sur 10 (ordre rendu
  `warning, success, info, critical`) ; correctif remis → 10/10.
- Le rang se lit dans l'ordre des cas de l'enum, lié par paramètres : un cas ajouté prend sa
  place sans toucher la requête.

---
id: TCK-1126
title: "Les annonces actives sortent de la plus grave à la moins grave, la critique en tête"
status: todo
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

- [ ] `AnnouncementResolver::activeFor()` trie sur le rang des cas de `AnnouncementSeverity`,
      du plus grave au moins grave, puis `starts_at`.
- [ ] Test dans `AnnouncementTest`.

## Critères d'acceptation

- [ ] AC1 — quatre annonces `info`, `success`, `critical`, `warning` sortent de
      `/api/announcements/active` dans l'ordre `critical`, `warning`, `success`, `info`.

## Hors périmètre

- Rendre toutes les annonces dans le bandeau (comportement visible neuf, V7) : le bandeau ne
  change pas.

## Notes d'implémentation

_(à remplir par implementing-specs)_

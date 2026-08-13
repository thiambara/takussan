---
id: TCK-286
title: "i18n — les libelles produits encore codes en dur"
status: todo
phase: P2
family: front
estimate: L
wave: null
created: 2026-08-12
updated: 2026-08-12
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [front, i18n, qualite]
---

## Objectif utilisateur

Qu'un utilisateur qui choisit l'anglais ou le wolof obtienne réellement l'anglais ou le wolof —
partout, y compris dans la navigation.

## Contrat de données

Les trois dictionnaires existent et sont complets : `src/messages/{fr,en,wo}.json` — 1376 clés
`fr`/`en`, 1265 `wo`. `wo` est deep-mergé sur `fr` pour un repli gracieux
(`src/i18n/request.ts`).

## Contraintes strictes (métier)

**La règle « le front possède le texte affiché » est une intention, pas un état.** Mesuré le
2026-08-12 : **82 fichiers sur 875** utilisent `useTranslations` / `getTranslations`. Des libellés
produits sont codés en dur en français, **y compris dans la navigation**.

**Rien ne mesure l'écart.** C'est le point le plus important de ce ticket : sans garde, la
proportion se dégradera à chaque écran neuf, exactement comme elle s'est dégradée jusqu'ici. Une
règle que rien ne mesure n'est pas une règle.

## Direction UX / Artistique

Aucune — ce ticket ne change aucun rendu, il change d'où vient le texte.

## Delta à produire

- [ ] **D'abord la garde, ensuite le travail.** Un script qui compte les nœuds de texte, `alt`,
      `placeholder`, `aria-label` et entrées bindées à un littéral qui ne passent pas par
      next-intl, avec un **cliquet** : le compte peut descendre, jamais monter.
- [ ] Le brancher dans `repo-ci.yml`.
- [ ] Résorber par surface, en commençant par la navigation et les états d'erreur — ce qu'un
      utilisateur voit avant tout le reste.

## Critères d'acceptation

- [ ] AC1 — la garde existe, tourne en CI, et son seuil ne peut que descendre.
- [ ] AC2 — la garde est **prouvée par mutation** : ajouter un `<h1>Texte</h1>` en dur la fait rougir.
- [ ] AC3 — la navigation (`AppSidebar`, `Navbar`, `Footer`) ne porte plus aucun libellé en dur.

## Hors périmètre

- La traduction elle-même du wolof : ce ticket branche les clés, il ne remplit pas les dictionnaires.

## Notes d'implémentation

Ardoise D-24. Le patron du cliquet — un compte qui ne peut que descendre — évite de bloquer le
projet sur un chantier de 793 fichiers tout en garantissant qu'il ne recule pas.

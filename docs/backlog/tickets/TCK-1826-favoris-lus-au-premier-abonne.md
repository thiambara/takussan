---
id: TCK-1826
title: "Les favoris d'un utilisateur connecté se lisent au premier abonné du magasin, pas à chaque chargement"
status: todo
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-136--lectures-du-navigateur-au-chargement-de-la-console-app-et-super-admin"
tags: [front, favoris, performance, pistes]
---

## Contexte

Réf : **P136.05** du fichier de pistes, `validé` par le porteur (V7 accordé). Premier des trois
tickets de la décision.

`AuthContext`, monté par le layout racine, relit tous les favoris d'un utilisateur connecté
(`fetchAllFavoritePropertyIds`, 50 par page, en série) à chaque chargement de document, puis
invalide `['favorites']`, y compris sur les écrans qui n'affichent aucun cœur (accueil d'agence,
console `/super-admin`).

## Décision du porteur

> porteur (2026-10-22) : trois tickets : les favoris lus au premier abonné du magasin, les lectures de premier affichage passées au serveur, le reste comme l'écrit la recommandation du délégué

Ce ticket porte la première partie : les favoris lus au premier abonné du magasin
(`FavoriteButton`, `useFavorite`, `FavoritesPopover`, `PublicFavoritesPage`, tous par
`useFavorites()`), plutôt qu'exclus par chemin, comme le recommande le délégué.

## Objectif utilisateur

Un utilisateur connecté qui ouvre un écran sans cœur ne paie pas la lecture de tous ses favoris ;
dès qu'un cœur ou le compteur s'affiche, ses favoris sont lus, une fois.

## Contrat de données

Aucun changement d'API (`GET /api/favorites`, inchangé).

## Contraintes strictes (métier)

- Un cœur affiché pour un utilisateur connecté finit rempli comme aujourd'hui : la lecture part
  dès que le premier abonné du magasin se monte.
- La déconnexion vide toujours le magasin ; un changement de compte ou d'agence relit les
  favoris si un abonné est monté, sinon au premier abonné suivant.

## Delta à produire

- [ ] `favoritesStore` : un chargeur à la demande, lancé au premier abonné (`useFavorites`), une
  fois par chargeur posé.
- [ ] `AuthContext` : l'amorçage des favoris pose ce chargeur au lieu de lire tout de suite.
- [ ] Test vitest : aucun abonné → aucune lecture ; premier abonné → une lecture ; deux abonnés →
  une seule.

## Critères d'acceptation

- [ ] AC1 — un utilisateur connecté sans aucun abonné du magasin : aucun appel à
  `fetchAllFavoritePropertyIds`.
- [ ] AC2 — un abonné qui se monte ensuite déclenche une lecture, et le magasin porte les favoris.
- [ ] AC3 — deux abonnés : une seule lecture ; le TCK-1764 tient (même compte relu → aucune
  relecture).

## Hors périmètre

- L'invalidation de `['favorites']` après l'amorçage (relance éventuelle de la liste de
  `/app/favorites`, « déduit, à vérifier » de l'entrée) : non mesurée, inchangée.
- Les lectures de premier affichage de `/super-admin` et de la mise en service (TCK-1828,
  TCK-1830).

## Notes d'implémentation

_(à remplir par implementing-specs)_

---
id: TCK-2508
title: Page Favoris « Le suivi » : ce qui a changé, recherches suivies au même endroit, sélection partagée
status: todo
phase: P1
family: front
estimate: M
wave: 85
created: 2026-11-08
updated: 2026-11-08
depends_on: [TCK-2507, TCK-2496]
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [front, favoris, mobile, audit-ux]
---

## Objectif utilisateur

Revenir sur ses favoris et voir tout de suite ce qui a bougé (prix en baisse, bien loué), agir (Visiter, WhatsApp), retrouver ses recherches suivies avec leurs nouveautés, et envoyer sa sélection à un proche sur WhatsApp. Anonyme, comprendre qu'un numéro suffit pour ne pas la perdre.

## Contrat de données

- Connecté : `GET /api/favorites` (avec `price_change`, TCK-2507) et `GET /api/saved-searches` (avec `last_viewed_at`) ; nouveautés par recherche : liste publique `published_after` (paramètre plat de `/api/public/properties/search`, TCK-2496) + `per_page=1`, `meta.total` (TCK-2496) ; ouvrir une recherche appelle `POST /api/saved-searches/{id}/viewed`.
- Anonyme : le magasin local des favoris garde, en plus de l'id, **le prix vu à l'ajout** ; l'écart se calcule contre le prix relu par `GET /api/public/properties/by-ids`.
- **Sélection partagée sans objet neuf côté API** : un lien `/[locale]/favorites/partage?ids=1,2,3` (au plus la borne de `by-ids`), lu par `by-ids` ; un id devenu non public disparaît en silence de la vue partagée. Page en lecture seule, `noindex`. Décision de ce ticket : le lien est un instantané des biens, pas une liste vivante — écart assumé par rapport à la note de la maquette, qui évoquait un objet API.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=favoris&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — tous ses écrans, téléphone et bureau.
- Deux onglets en tête, « Biens » et « Recherches » ; chaque carte de bien : prix d'abord, puis la pastille de changement (« −50 000 F depuis l'ajout », « Loué ») et les gestes Visiter et WhatsApp (décisions 3a, 4a de l'audit).
- Un favori loué ou retiré reste visible, éteint, avec sa raison, « Biens proches » et « Retirer ».
- Anonyme : une carte (pas une barrière) propose de garder ses favoris partout avec son numéro.
- « Partager la sélection » : feuille de partage du téléphone (`navigator.share`), WhatsApp en tête ; copie du lien à défaut.
- Cœur plein terracotta (`--primary`), plus de rouge vif ; tutoiement (découverte).

## Contraintes strictes (métier)

- Rien de ce que la page fait aujourd'hui ne se perd : pagination, note personnelle, état « plus disponible », versement des favoris de l'appareil au compte à la connexion, alerte sans compte (`PublicSearchAlertForm`).
- Un favori ne s'ajoute que sur un bien public (règle TCK-599 inchangée).
- La vue partagée n'expose rien du propriétaire de la sélection (ni nom, ni note).
- Le popover de favoris de bureau ne s'ouvre plus au téléphone (l'onglet Favoris de TCK-2493 le remplace).

## Delta à produire

- [ ] Page Favoris en deux onglets, cartes « suivi » (écart de prix, état, gestes).
- [ ] Onglet Recherches : chaque recherche sauvegardée avec ses biens nouveaux, ouverture qui marque « vue ».
- [ ] Magasin local : prix à l'ajout pour l'anonyme.
- [ ] Carte de compte pour l'anonyme.
- [ ] Partage de la sélection + page partagée en lecture seule.
- [ ] Clés i18n `fr`/`en`/`wo` (wolof en pause : texte français en `wo`).
- [ ] Tests (rendu des états, calcul de l'écart, lien partagé, absence de note dans la vue partagée).

## Critères d'acceptation

- [ ] AC1 — Un favori dont `price_change = -50000` affiche « −50 000 F » ; `price_change: null` n'affiche aucune pastille (pas « 0 F »).
- [ ] AC2 — Une recherche dont trois biens ont été publiés après `last_viewed_at` affiche « 3 nouveaux » ; après l'avoir ouverte puis être revenu, le compte repart de zéro.
- [ ] AC3 — Le lien partagé ouvert dans une session privée montre les mêmes biens publics, sans note ni nom ; un bien devenu loué n'y figure plus.
- [ ] AC4 — Anonyme, un favori ajouté à 300 000 dont le prix relu est 250 000 affiche l'écart.
- [ ] AC5 — À 360 px, aucune carte ne fait défiler la page horizontalement.

## Hors périmètre

- La barre d'onglets et l'onglet Favoris (TCK-2493).
- Une sélection partagée modifiable à plusieurs.

## Notes d'implémentation

- **(Revue de TCK-2507, 2026-11-09) Les favoris de l'appareil versés au compte à la connexion prennent le prix de la
  connexion.** `favoritesStore.ts` POSTe les identifiants locaux sur `/api/favorites` au login : `FavoriteObserver`
  leur pose `price_at_favorite` au prix de CET instant. Pour eux, « −X F depuis l'ajout » veut donc dire « depuis
  l'enregistrement dans le compte ». Le libellé (ou le suivi gardé côté navigateur) doit en tenir compte.
- `price_change` est `null` pour un favori posé sur un bien qui n'était PAS public à l'ajout (brouillon, bien privé) :
  aucun écart ne s'affiche, même une fois le bien publié (décision de la session, TCK-2507).

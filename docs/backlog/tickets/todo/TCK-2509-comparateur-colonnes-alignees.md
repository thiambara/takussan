---
id: TCK-2509
title: Comparateur « Colonnes alignées » : ce qui diffère, le meilleur marqué, « Partager »
status: todo
phase: P1
family: front
estimate: M
wave: 85
created: 2026-11-08
updated: 2026-11-08
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [front, comparateur, mobile, audit-ux]
---

## Objectif utilisateur

Comparer deux à quatre biens d'un coup d'œil au téléphone — trois valeurs côte à côte par critère, sans relire les noms — savoir lequel est le moins cher, le plus grand, le moins coûteux à l'entrée, puis envoyer la comparaison à la famille sur WhatsApp.

## Contrat de données

Aucun endpoint neuf : `GET /api/public/properties/compare?ids=` (TCK-082), critères et ordre de `compare-rows.ts`, coût d'entrée de l'API (TCK-598). Le loyer au m² se calcule au front (prix ÷ surface, seulement quand les deux existent).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=comparateur&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
- En-tête collant : une colonne par bien (photo, prix, titre court) ; chaque critère est une ligne dont les valeurs s'alignent sous leur bien.
- Par défaut, seulement les lignes qui diffèrent, suivies d'une phrase « Pareil pour les N : … » qui se déplie ; bascule « Tout afficher ».
- Le meilleur de chaque ligne marqué (moins cher, plus grand, coût d'entrée le plus bas, loyer au m² le plus bas) ; neutres : étage, meublé, quartier, équipements.
- Pied : « Ajouter un bien » et **« Partager »** (feuille de partage du téléphone, WhatsApp en tête ; copie du lien `?ids=` à défaut). **Pas de bouton « Visiter les N »** (décision du porteur, 2026-11-08) : Visiter et WhatsApp restent sur chaque bien.
- En bureau, « Copier le lien » devient « Partager ».

## Contraintes strictes (métier)

- L'URL `?ids=` fait foi et reste juste quand on retire un bien (corrige le relevé de l'audit où le panier la réécrivait).
- Quatre biens au plus ; la place libre se voit ; « Réduire » ne vide pas ; « Vider » s'annule sans écraser un bien ajouté entre-temps (TCK-561, TCK-577) ; la sélection tient 24 h.
- Un bien devenu indisponible quitte la comparaison avec un avis et « Biens proches » — il n'occupe plus une place.
- Une ligne vide pour tous les biens ne s'affiche pas.
- Plus de toast à chaque ajout (la pastille de TCK-2493 dit déjà « 3 »).

## Delta à produire

- [ ] Grille en colonnes alignées sous en-tête collant (téléphone et bureau).
- [ ] Filtre « seulement ce qui diffère » + phrase « Pareil pour les N ».
- [ ] Marquage du meilleur par critère (table des critères qui ont un sens).
- [ ] Ligne « Loyer au m² ».
- [ ] « Partager » à la place de « Copier le lien ».
- [ ] Sortie d'un bien indisponible avec avis.
- [ ] Clés i18n `fr`/`en`/`wo`.
- [ ] Tests (lignes différentes, meilleur marqué, `?ids=` après retrait, partage avec et sans `navigator.share`).

## Critères d'acceptation

- [ ] AC1 — Trois biens dont deux critères sont identiques : ces critères n'apparaissent pas en ligne, et « Pareil pour les 3 » les nomme.
- [ ] AC2 — Le moins cher porte la marque sur la ligne Prix ; aucune marque sur Étage ou Meublé.
- [ ] AC3 — Retirer le deuxième bien donne une URL `?ids=` sans lui, et la recharger montre la même comparaison.
- [ ] AC4 — Sans `navigator.share`, « Partager » copie le lien et le dit.
- [ ] AC5 — À 360 px avec quatre biens, la page ne défile pas horizontalement (la grille défile dans son conteneur si besoin).

## Hors périmètre

- La pastille du comparateur et la règle des couches (TCK-2493).
- Une visite groupée de plusieurs biens.

## Notes d'implémentation

_(à remplir par implementing-specs)_

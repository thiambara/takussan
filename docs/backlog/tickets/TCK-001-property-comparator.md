---
id: TCK-001
title: Comparateur de biens côte à côte
status: todo
phase: P2
family: applicatif
estimate: S
created: 2026-04-15
updated: 2026-04-15
depends_on: [TCK-025]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models:
    - docs/models-spec.md#3-property
tags: [front, search, property]
---

## Contexte

Issu du warning `features.md §1.2 P2` (ligne 108), justifié comme applicatif pur
(sélection multiple front, pas de persistance) en passe 006.
Voir `docs/backlog/_archive/warnings-backlog.md` pour l'historique complet.

## Objectif

Permettre à un visiteur de sélectionner jusqu'à 4 biens depuis les résultats de
recherche et de les afficher côte à côte dans un tableau comparatif.

## Delta à produire

- [ ] State React `selectedProperties` (scope: sessionStorage, `useState` + `useEffect` pour persistance)
- [ ] Bouton « Comparer » sur `PropertyCard`
- [ ] Barre flottante avec compteur et bouton « Voir la comparaison » (≥ 2 biens)
- [ ] Page Next.js `/comparer` — tableau responsive, 1 colonne par bien
- [ ] Logique de remplacement FIFO au-delà de 4 biens + toast info
- [ ] Bouton « Retirer » par colonne

## Critères d'acceptation

- [ ] Sélection plafonnée à 4 biens, le 5ᵉ remplace le plus ancien
- [ ] L'état survit au rechargement de page (sessionStorage)
- [ ] La page `/comparer` affiche prix, type, surface, chambres, sdb, amenités, adresse, agent
- [ ] Les différences d'amenités entre biens sont surlignées visuellement
- [ ] Si ≤ 1 bien restant, redirection vers `/search-results`

## Hors périmètre

- Persistance serveur de la sélection
- Partage par URL
- Export PDF

## Notes d'implémentation

_(à remplir par spec-coder)_

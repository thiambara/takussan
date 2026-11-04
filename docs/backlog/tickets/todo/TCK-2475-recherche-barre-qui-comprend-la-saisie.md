---
id: TCK-2475
title: "Recherche : la barre de recherche suggère au fil de la frappe — la saisie comprise, les recherches populaires, les lieux, trois biens, et l'alerte quand rien ne correspond"
status: todo
phase: P2
family: front
estimate: L
wave: 81
created: 2026-11-04
updated: 2026-11-04
depends_on: [TCK-2474]
blocks: []
spec_refs:
  features:
    - "docs/features.md"
  models: []
tags: [front, search, suggestion, adr-0088]
---

## Objectif utilisateur

Le visiteur trouve ce qu'il cherche en tapant trois mots : la barre comprend, propose, montre déjà des biens, et lui
offre d'être alerté quand rien ne correspond encore.

## Contrat de données

`GET /api/search/suggest` de TCK-2474 (clés `interpretation`, `completions`, `popular`, `places`, `previews`, et les
clés existantes). L'URL de la liste se construit par la table des clés de recherche existante (`SEARCH_FILTER_KEYS`,
`parametreDe`, `urlDeSuggestion`) : une suggestion comprise mène à la liste filtrée par ses critères. L'alerte sans
compte et la recherche sauvegardée existent (TCK-599) : les réutiliser.

## Direction UX / Artistique

- **Champ vide au focus** : « Récentes » (les dernières recherches de l'appareil, effaçables, stockage local enveloppé de
  `try/catch`), « Populaires » (`popular`), et deux raccourcis Louer / Acheter.
- **Pendant la frappe**, dans cet ordre : la saisie comprise en première ligne, sous forme de puces lisibles (« Appartement ·
  3 chambres · Almadies · ≤ 500 000 F ») avec son nombre de biens — c'est la suggestion par défaut d'Entrée ; puis les
  complétions populaires (le texte tapé en surbrillance), les lieux et types, puis trois biens en aperçu (vignette, prix,
  quartier) qui ouvrent la fiche.
- **Rien ne clignote** : les résultats précédents restent affichés pendant le chargement ; une réponse périmée n'écrase
  jamais une plus récente ; anti-rebond court (≈ 100 ms).
- **Zéro résultat** : une ligne « Être alerté quand un bien correspond » qui ouvre l'alerte existante pré-remplie des
  critères compris.
- Clavier complet (flèches, Entrée, Échap, Tab), lecteurs d'écran (rôle combobox, annonce du nombre de suggestions),
  cibles tactiles confortables à 360 px, mêmes comportements dans la barre de l'accueil, la navbar et la barre de l'app.
- Charte « Ancrage Local Contemporain » (`docs/design-guidelines.md`) ; textes par next-intl (fr, en ; wo = français tel
  quel, wolof en pause). Les libellés des puces viennent des traductions existantes des filtres, jamais de l'API.

## Contraintes strictes (métier)

- Les tests ARIA et de rendu existants (`SearchAutocomplete.aria.test.tsx`, `SearchAutocomplete.test.tsx`,
  `rendu-serveur.test.tsx`) restent verts ou sont mis à jour pour le nouveau comportement, jamais supprimés.
- `useApiQuery` : le préfixe `/api` s'écrit par l'appelant.
- Aucune recherche n'est envoyée au journal depuis la barre (le serveur journalise la recherche validée).

## Critères d'acceptation

- [ ] AC1 — Taper « appart 3ch almadies » montre la saisie comprise en tête ; Entrée ouvre la liste filtrée par ces critères.
- [ ] AC2 — Focus sur le champ vide : récentes et populaires ; une recherche faite apparaît dans les récentes.
- [ ] AC3 — Une saisie sans résultat propose l'alerte, pré-remplie.
- [ ] AC4 — Tests Vitest de ces trois parcours ; `npm run lint`, `npx tsc --noEmit`, `npm run check:*` verts.

## Hors périmètre

- La compréhension elle-même (serveur, TCK-2473/2474).

## Notes d'implémentation

_(à remplir)_
